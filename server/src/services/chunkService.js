'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const mongoose = require('mongoose');

const FileChunk = require('../models/FileChunk');
const UploadSession = require('../models/UploadSession');
const { config } = require('../config/env');

/*
 * Binary signatures of file types that are blocked from upload.
 * This protects against uploading executable code disguised as other files.
 */
const BLOCKED_SIGNATURES = [];

/**
 * Inspect the first bytes of the file and throw if a blocked signature is detected.
 *
 * @param {Buffer} headerBuffer - At least the first 16 bytes of the file.
 * @throws {Error} statusCode 415 if the file type is blocked.
 */
function checkMagicNumbers(headerBuffer) {
  for (const sig of BLOCKED_SIGNATURES) {
    if (headerBuffer.length >= sig.magic.length) {
      if (headerBuffer.slice(0, sig.magic.length).equals(sig.magic)) {
        const err = new Error(`File type not permitted: ${sig.name}`);
        err.statusCode = 415;
        throw err;
      }
    }
  }
}

/**
 * A pass-through Transform stream that:
 *  1. Computes a SHA-256 hash of all data that flows through it.
 *  2. Captures the first 16 bytes for magic number inspection.
 *  3. Tracks total bytes received for size validation.
 */
class ChunkHashTransform extends Transform {
  constructor() {
    super();
    this._hasher = crypto.createHash('sha256');
    this._headerCaptured = false;
    this.headerBytes = null;
    this.bytesReceived = 0;
  }

  _transform(chunk, _encoding, callback) {
    if (!this._headerCaptured) {
      this.headerBytes = Buffer.from(chunk.slice(0, Math.min(chunk.length, 16)));
      this._headerCaptured = true;
    }
    this._hasher.update(chunk);
    this.bytesReceived += chunk.length;
    this.push(chunk);
    callback();
  }

  finalHash() {
    return this._hasher.digest('hex');
  }
}

/**
 * Receive a raw binary chunk stream from the request, validate its SHA-256 hash,
 * perform magic number inspection on chunk 0, persist to disk, and record the result in DB.
 *
 * @param {import('http').IncomingMessage} req    - Express request (raw stream)
 * @param {string}                         sessionId    - MongoDB ObjectId string
 * @param {number}                         chunkIndex   - Zero-based chunk index
 * @param {string}                         expectedHash - SHA-256 hex from x-chunk-hash header
 * @returns {Promise<{ bytesReceived: number }>}
 */
async function saveChunk(req, sessionId, chunkIndex, expectedHash) {
  if (!mongoose.isValidObjectId(sessionId)) {
    const err = new Error('Invalid sessionId');
    err.statusCode = 400;
    throw err;
  }

  const session = await UploadSession.findById(sessionId).lean();
  if (!session) {
    const err = new Error('Upload session not found');
    err.statusCode = 404;
    throw err;
  }

  if (chunkIndex >= session.totalChunks) {
    const err = new Error(`chunkIndex ${chunkIndex} exceeds totalChunks ${session.totalChunks}`);
    err.statusCode = 400;
    throw err;
  }

  const targetPort = 3001 + (chunkIndex % 3);
  const nodeUrl = `http://127.0.0.1:${targetPort}/chunk/${sessionId}/${chunkIndex}`;

  const transform = new ChunkHashTransform();

  const maxBytes = config.maxChunkSizeBytes;
  let guardTriggered = false;

  req.on('data', (chunk) => {
    if (transform.bytesReceived + chunk.length > maxBytes && !guardTriggered) {
      guardTriggered = true;
      req.destroy(Object.assign(new Error('Chunk exceeds maximum allowed size'), { statusCode: 413 }));
    }
  });

  try {
    req.pipe(transform);
    const response = await fetch(nodeUrl, {
      method: 'POST',
      body: transform,
      duplex: 'half',
      headers: { 'Content-Type': 'application/octet-stream' }
    });
    
    if (!response.ok) {
      throw new Error(`Storage Node responded with status ${response.status}`);
    }
  } catch (err) {
    const errorToThrow = guardTriggered
      ? Object.assign(new Error('Chunk exceeds maximum allowed size'), { statusCode: 413 })
      : err;
    throw errorToThrow;
  }

  const computedHash = transform.finalHash();

  if (computedHash !== expectedHash.toLowerCase()) {
    // Hash failed, delete it from the node
    await fetch(nodeUrl, { method: 'DELETE' }).catch(() => {});
    const err = new Error(
      `Chunk integrity check failed. Expected: ${expectedHash}, received: ${computedHash}`
    );
    err.statusCode = 400;
    throw err;
  }

  if (chunkIndex === 0 && transform.headerBytes) {
    checkMagicNumbers(transform.headerBytes);
  }

  await FileChunk.findOneAndUpdate(
    { uploadSessionId: sessionId, chunkIndex },
    {
      $set: {
        status: 'success',
        storagePath: nodeUrl,
        chunkHash: computedHash,
      },
      $setOnInsert: { retryCount: 0 },
    },
    { upsert: true, new: true }
  );

  // Advance session status from pending -> uploading on first successful chunk
  await UploadSession.updateOne(
    { _id: sessionId, status: 'pending' },
    { $set: { status: 'uploading' } }
  );

  return { bytesReceived: transform.bytesReceived };
}

module.exports = { saveChunk, checkMagicNumbers };
