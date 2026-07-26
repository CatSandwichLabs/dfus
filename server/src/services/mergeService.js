'use strict';

const fs = require('fs');
const { Readable } = require('stream');
const mongoose = require('mongoose');

const FileChunk = require('../models/FileChunk');
const UploadSession = require('../models/UploadSession');
const FileRecord = require('../models/FileRecord');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const archiver = require('archiver');
const FormData = require('form-data');
const { computeSHA256File } = require('../utils/hashUtils');
const { getFinalPath, safeDelete } = require('../utils/pathUtils');

/**
 * Pipe one readable stream into a writable stream without closing the writable.
 * Properly handles backpressure and propagates errors.
 *
 * @param {fs.ReadStream}  readStream
 * @param {fs.WriteStream} writeStream
 * @returns {Promise<void>}
 */
function appendStreamToWritable(readStream, writeStream) {
  return new Promise((resolve, reject) => {
    readStream.on('error', (err) => {
      readStream.destroy();
      reject(err);
    });
    writeStream.on('error', reject);
    readStream.on('end', resolve);
    readStream.pipe(writeStream, { end: false });
  });
}

/**
 * Upload a file to Gofile.io (Free anonymous cloud storage)
 */
async function uploadToGofile(filePath) {
  try {
    console.log(`[Cloud Integration] Fetching Gofile servers...`);
    const serversRes = await fetch('https://api.gofile.io/servers', { method: 'GET' });
    const serversData = await serversRes.json();
    if (serversData.status !== 'ok') throw new Error('Gofile servers unavailable');
    
    const serverName = serversData.data.servers[0].name;
    const uploadUrl = `https://${serverName}.gofile.io/uploadFile`;
    console.log(`[Cloud Integration] Uploading to ${uploadUrl}...`);

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    const uploadData = await uploadRes.json();
    if (uploadData.status !== 'ok') throw new Error('Gofile upload failed: ' + JSON.stringify(uploadData));

    console.log(`[Cloud Integration] Success! Cloud URL: ${uploadData.data.downloadPage}`);
    return uploadData.data.downloadPage;
  } catch (err) {
    console.error('[Cloud Integration] Error:', err.message);
    return null; // Return null on failure so the local merge doesn't fail entirely
  }
}

/**
 * Merge all successfully uploaded chunks for a session into a single file,
 * verify the SHA-256 of the result matches the original fileHash, and clean up
 * temporary chunk files on success.
 *
 * All chunk reads and the final write are performed as streams to keep RAM usage flat.
 *
 * @param {string} sessionId - MongoDB ObjectId string
 * @param {string} [password] - Optional password to protect the download link
 * @param {Array} [folderMetadata] - Array of { path, start, end } if uploading a folder
 * @returns {Promise<{ message: string, finalPath: string, fileHash: string, shareId?: string }>}
 */
async function mergeChunks(sessionId, password, folderMetadata, selfDestruct = false, geoblockCity = '', maxDownloads = 0, expires = null, webhookUrl = null) {
  if (!mongoose.isValidObjectId(sessionId)) {
    const err = new Error('Invalid sessionId');
    err.statusCode = 400;
    throw err;
  }

  const session = await UploadSession.findById(sessionId);
  if (!session) {
    const err = new Error('Upload session not found');
    err.statusCode = 404;
    throw err;
  }

  if (session.status === 'complete') {
    // If it's already merged, try to fetch the existing file record
    const existingRecord = await FileRecord.findOne({ fileHash: session.fileHash }).lean();
    return {
      message: 'File already merged and verified',
      finalPath: session.finalPath,
      fileHash: session.fileHash,
      shareId: existingRecord ? existingRecord.shareId : undefined,
    };
  }

  if (session.status === 'merging') {
    const err = new Error('A merge operation is already in progress for this session');
    err.statusCode = 409;
    throw err;
  }

  if (session.status === 'failed') {
    const err = new Error('This session has failed and cannot be merged');
    err.statusCode = 409;
    throw err;
  }

  const chunks = await FileChunk.find(
    { uploadSessionId: sessionId, status: 'success' },
    { chunkIndex: 1, storagePath: 1 }
  )
    .sort({ chunkIndex: 1 })
    .lean();

  if (chunks.length !== session.totalChunks) {
    const received = new Set(chunks.map((c) => c.chunkIndex));
    const missing = [];
    for (let i = 0; i < session.totalChunks; i++) {
      if (!received.has(i)) missing.push(i);
    }
    const err = new Error(`Cannot merge: missing chunk indices [${missing.join(', ')}]`);
    err.statusCode = 400;
    throw err;
  }

  for (const chunk of chunks) {
    if (chunk.storagePath.startsWith('http')) {
      const nodeRes = await fetch(chunk.storagePath, { method: 'HEAD' }).catch(() => ({ ok: false }));
      if (!nodeRes.ok) {
        const err = new Error(`Chunk file for index ${chunk.chunkIndex} is missing from remote node: ${chunk.storagePath}`);
        err.statusCode = 500;
        throw err;
      }
    } else if (!fs.existsSync(chunk.storagePath)) {
      const err = new Error(
        `Chunk file for index ${chunk.chunkIndex} is missing from storage: ${chunk.storagePath}`
      );
      err.statusCode = 500;
      throw err;
    }
  }

  // Mark merging to prevent duplicate merge requests
  await UploadSession.updateOne({ _id: sessionId }, { $set: { status: 'merging' } });

  let finalPath = getFinalPath(session.fileName);

  try {
    const writeStream = fs.createWriteStream(finalPath);

    // Stream each chunk sequentially into the output file
    for (const chunk of chunks) {
      let readStream;
      if (chunk.storagePath.startsWith('http')) {
        const res = await fetch(chunk.storagePath);
        if (!res.ok) throw new Error(`Failed to fetch chunk from node: ${res.status}`);
        readStream = Readable.fromWeb(res.body);
      } else {
        readStream = fs.createReadStream(chunk.storagePath);
      }
      await appendStreamToWritable(readStream, writeStream);
    }

    // Flush and close the write stream
    await new Promise((resolve, reject) => {
      writeStream.end();
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Stream-compute SHA-256 of the merged file and compare
    const computedHash = await computeSHA256File(finalPath);

    if (computedHash !== session.fileHash) {
      await safeDelete(finalPath);
      await UploadSession.updateOne({ _id: sessionId }, { $set: { status: 'failed' } });
      const err = new Error(
        `File integrity verification failed. SHA-256 mismatch. ` +
          `Expected: ${session.fileHash}, computed: ${computedHash}`
      );
      err.statusCode = 422;
      throw err;
    }

    let isFolder = false;
    if (folderMetadata && Array.isArray(folderMetadata) && folderMetadata.length > 0) {
      isFolder = true;
      const zipPath = finalPath + '.zip';
      await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        output.on('close', resolve);
        archive.on('error', reject);
        
        archive.pipe(output);
        
        for (const fileMeta of folderMetadata) {
          archive.append(fs.createReadStream(finalPath, {
            start: fileMeta.start,
            end: fileMeta.end - 1
          }), { name: fileMeta.path });
        }
        
        archive.finalize();
      });
      
      await safeDelete(finalPath);
      finalPath = zipPath;
      session.fileName = session.fileName + '.zip';
      session.fileSizeBytes = fs.statSync(finalPath).size;
    }

    // Remove all temporary chunk files
    const deleteErrors = [];
    for (const chunk of chunks) {
      try {
        if (chunk.storagePath.startsWith('http')) {
          await fetch(chunk.storagePath, { method: 'DELETE' }).catch(() => {});
        } else {
          await safeDelete(chunk.storagePath);
        }
      } catch (delErr) {
        deleteErrors.push(`chunk[${chunk.chunkIndex}]: ${delErr.message}`);
      }
    }

    await UploadSession.updateOne(
      { _id: sessionId },
      { $set: { status: 'complete', finalPath } }
    );

    // Create shareable record
    const shareId = crypto.randomBytes(4).toString('hex');
    const editToken = crypto.randomBytes(16).toString('hex'); // Token for file management
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    
    // Default expiry: 7 days from now, or use custom 'expires'
    let expiresAt = new Date();
    if (expires === '1h') {
      expiresAt.setHours(expiresAt.getHours() + 1);
    } else if (expires === '24h') {
      expiresAt.setHours(expiresAt.getHours() + 24);
    } else if (expires === 'never') {
      expiresAt = null;
    } else {
      expiresAt.setDate(expiresAt.getDate() + 7);
    }

    // Upload to Cloud
    const cloudUrl = await uploadToGofile(finalPath);

    const fileRecord = new FileRecord({
      shareId,
      editToken,
      originalName: session.fileName,
      storagePath: finalPath,
      sizeBytes: session.fileSizeBytes,
      fileHash: session.fileHash,
      isFolder,
      passwordHash,
      cloudUrl,
      selfDestruct: !!selfDestruct,
      expiresAt,
      geoblockCity,
      maxDownloads: maxDownloads || 0,
      webhookUrl
    });
    
    await fileRecord.save();

    const result = {
      message: 'File merged and SHA-256 verified successfully',
      finalPath,
      fileHash: session.fileHash,
      shareId,
      editToken, // Return the edit token
      cloudUrl,
    };
    if (deleteErrors.length > 0) {
      result.cleanupWarnings = deleteErrors;
    }
    return result;
  } catch (err) {
    // Only reset status if the error wasn't already handled (e.g. SHA-256 mismatch already sets 'failed')
    if (err.statusCode !== 422) {
      await UploadSession.updateOne({ _id: sessionId }, { $set: { status: 'failed' } }).catch(
        () => {}
      );
      await safeDelete(finalPath).catch(() => {});
    }
    throw err;
  }
}

module.exports = { mergeChunks };
