'use strict';

const express = require('express');
const mongoose = require('mongoose');

const { getOrCreateSession } = require('../services/sessionService');
const { saveChunk } = require('../services/chunkService');
const { mergeChunks } = require('../services/mergeService');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/upload/status
// ---------------------------------------------------------------------------
// Initialize or resume an upload session.
// Query params: fileHash, fileName, totalChunks, fileSizeBytes
//
// Response: { sessionId, status, uploadedChunks: number[] }
// ---------------------------------------------------------------------------
router.get('/status', async (req, res, next) => {
  try {
    const { fileHash, fileName, totalChunks, fileSizeBytes } = req.query;

    if (!fileHash || !fileName || !totalChunks || !fileSizeBytes) {
      return res.status(400).json({
        error: {
          message:
            'Missing required query parameters: fileHash, fileName, totalChunks, fileSizeBytes',
          status: 400,
        },
      });
    }

    if (!/^[a-f0-9]{64}$/i.test(fileHash)) {
      return res.status(400).json({
        error: {
          message: 'fileHash must be a 64-character hex SHA-256 string',
          status: 400,
        },
      });
    }

    const parsedChunks = parseInt(totalChunks, 10);
    const parsedSize = parseInt(fileSizeBytes, 10);

    if (isNaN(parsedChunks) || parsedChunks < 0 || parsedChunks > 500000) {
      return res.status(400).json({
        error: { message: 'totalChunks must be an integer between 0 and 500000', status: 400 },
      });
    }

    if (isNaN(parsedSize) || parsedSize < 0) {
      return res.status(400).json({
        error: { message: 'fileSizeBytes must be a non-negative integer', status: 400 },
      });
    }

    const result = await getOrCreateSession({
      fileHash,
      fileName,
      totalChunks: parsedChunks,
      fileSizeBytes: parsedSize,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/upload/chunk
// ---------------------------------------------------------------------------
// Receive a single raw binary chunk.
//
// Required headers:
//   x-upload-session-id : MongoDB session ObjectId
//   x-chunk-index       : Zero-based chunk index (integer)
//   x-chunk-hash        : SHA-256 hex of the chunk binary
//
// Content-Type: application/octet-stream
// Body: raw binary chunk data
//
// Response: { chunkIndex, status: 'success', bytesReceived }
// ---------------------------------------------------------------------------
router.post('/chunk', async (req, res, next) => {
  try {
    const sessionId = (req.headers['x-upload-session-id'] || '').trim();
    const chunkIndexRaw = (req.headers['x-chunk-index'] || '').trim();
    const chunkHash = (req.headers['x-chunk-hash'] || '').trim();

    if (!sessionId || !chunkIndexRaw || !chunkHash) {
      return res.status(400).json({
        error: {
          message:
            'Missing required headers: x-upload-session-id, x-chunk-index, x-chunk-hash',
          status: 400,
        },
      });
    }

    if (!/^[a-f0-9]{64}$/i.test(chunkHash)) {
      return res.status(400).json({
        error: { message: 'x-chunk-hash must be a 64-character hex SHA-256 string', status: 400 },
      });
    }

    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({
        error: { message: 'x-upload-session-id is not a valid session ID', status: 400 },
      });
    }

    const chunkIndex = parseInt(chunkIndexRaw, 10);
    if (isNaN(chunkIndex) || chunkIndex < 0) {
      return res.status(400).json({
        error: { message: 'x-chunk-index must be a non-negative integer', status: 400 },
      });
    }

    const result = await saveChunk(req, sessionId, chunkIndex, chunkHash);

    res.json({ chunkIndex, status: 'success', bytesReceived: result.bytesReceived });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/upload/merge
// ---------------------------------------------------------------------------
// Trigger final merge of all chunks into a single file.
//
// Body (JSON): { sessionId }
//
// Response: { message, finalPath, fileHash }
// ---------------------------------------------------------------------------
router.post('/merge', express.json({ limit: '5mb' }), async (req, res, next) => {
  try {
    const { sessionId, password, folderMetadata, selfDestruct, geoblockCity, maxDownloads, expires, webhookUrl, targetInboxId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({
        error: { message: 'Missing required body field: sessionId', status: 400 },
      });
    }

    const result = await mergeChunks(sessionId, password, folderMetadata, selfDestruct, geoblockCity, maxDownloads, expires, webhookUrl, targetInboxId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
