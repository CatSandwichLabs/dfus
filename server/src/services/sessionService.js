'use strict';

const UploadSession = require('../models/UploadSession');
const FileChunk = require('../models/FileChunk');

/**
 * Retrieve an existing upload session by fileHash or create a new one.
 * Returns the session ID and the list of chunk indices that have already
 * been successfully uploaded so the client can skip them on resume.
 *
 * @param {object} params
 * @param {string} params.fileHash      - SHA-256 hex of the full file (from client)
 * @param {string} params.fileName      - Original filename
 * @param {number} params.totalChunks   - Total number of 5MB chunks
 * @param {number} params.fileSizeBytes - Total file size in bytes
 * @returns {Promise<{ sessionId: string, status: string, uploadedChunks: number[] }>}
 */
async function getOrCreateSession({ fileHash, fileName, totalChunks, fileSizeBytes }) {
  const normalizedHash = fileHash.toLowerCase();

  let session = await UploadSession.findOne({ fileHash: normalizedHash });

  if (!session) {
    session = await UploadSession.create({
      fileHash: normalizedHash,
      fileName,
      totalChunks,
      fileSizeBytes,
    });
    return {
      sessionId: session._id.toString(),
      status: session.status,
      uploadedChunks: [],
    };
  }

  const successChunks = await FileChunk.find(
    { uploadSessionId: session._id, status: 'success' },
    { chunkIndex: 1, _id: 0 }
  ).lean();

  return {
    sessionId: session._id.toString(),
    status: session.status,
    uploadedChunks: successChunks.map((c) => c.chunkIndex),
  };
}

module.exports = { getOrCreateSession };
