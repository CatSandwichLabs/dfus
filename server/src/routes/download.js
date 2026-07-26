'use strict';

const express = require('express');
const fs = require('fs');
const bcrypt = require('bcrypt');
const FileRecord = require('../models/FileRecord');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/download/:shareId/info
// ---------------------------------------------------------------------------
// Get file info and whether it requires a password.
// ---------------------------------------------------------------------------
router.get('/:shareId/info', async (req, res, next) => {
  try {
    const { shareId } = req.params;
    const record = await FileRecord.findOne({ shareId });

    if (!record) {
      return res.status(404).json({
        error: { message: 'File not found or link expired', status: 404 },
      });
    }

    res.json({
      originalName: record.originalName,
      sizeBytes: record.sizeBytes,
      isFolder: record.isFolder,
      requiresPassword: !!record.passwordHash,
      selfDestruct: record.selfDestruct,
      expiresAt: record.expiresAt,
      cloudUrl: record.cloudUrl,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/download/:shareId
// ---------------------------------------------------------------------------
// Redirects browser to the download landing page.
// ---------------------------------------------------------------------------
router.get('/:shareId', (req, res) => {
  res.redirect(`/download.html?id=${req.params.shareId}`);
});
// ---------------------------------------------------------------------------
// GET /api/download/:shareId/stream
// ---------------------------------------------------------------------------
// Stream the file. Supports Range headers. Requires password in query if protected.
// ---------------------------------------------------------------------------
router.get('/:shareId/stream', async (req, res, next) => {
  try {
    const { shareId } = req.params;
    const { password } = req.query;

    const record = await FileRecord.findOne({ shareId });

    if (!record) {
      return res.status(404).json({
        error: { message: 'File not found or link expired', status: 404 },
      });
    }

    if (record.passwordHash) {
      if (!password) {
        return res.status(401).json({
          error: { message: 'Password required to download this file', status: 401 },
        });
      }
      
      const isMatch = await bcrypt.compare(password, record.passwordHash);
      if (!isMatch) {
        return res.status(403).json({
          error: { message: 'Incorrect password', status: 403 },
        });
      }
    }

    if (!fs.existsSync(record.storagePath)) {
      return res.status(500).json({
        error: { message: 'Internal error: File data missing from disk', status: 500 },
      });
    }

    // Update download count if not a Range request or if it's the first byte
    if (!req.headers.range || req.headers.range.startsWith('bytes=0-')) {
      await FileRecord.updateOne({ _id: record._id }, { $inc: { downloadCount: 1 } });
    }

    // res.download automatically handles HTTP Range requests perfectly!
    res.download(record.storagePath, record.originalName, async (err) => {
      if (err && !res.headersSent) {
        console.error(`Error streaming download for ${shareId}:`, err.message);
      }

      // If it's a fallback download (no Range) and self-destruct is true, burn it after sending
      if (record.selfDestruct && (!req.headers.range || req.headers.range.startsWith('bytes=0-'))) {
        const { safeDelete } = require('../utils/pathUtils');
        await safeDelete(record.storagePath).catch(() => {});
        await FileRecord.deleteOne({ _id: record._id }).catch(() => {});
        console.log(`[Burn] File ${shareId} has self-destructed via fallback stream.`);
      }
    });

  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/download/:shareId/burn
// ---------------------------------------------------------------------------
// Triggered by frontend after a successful download if selfDestruct is true.
// ---------------------------------------------------------------------------
router.post('/:shareId/burn', async (req, res, next) => {
  try {
    const { shareId } = req.params;
    const { password } = req.body || {};

    const record = await FileRecord.findOne({ shareId });
    if (!record || !record.selfDestruct) {
      return res.json({ status: 'ignored' });
    }

    if (record.passwordHash) {
      if (!password) return res.status(401).json({ error: 'Password required' });
      const isMatch = await bcrypt.compare(password, record.passwordHash);
      if (!isMatch) return res.status(403).json({ error: 'Incorrect password' });
    }

    // Burn the file
    const { safeDelete } = require('../utils/pathUtils');
    await safeDelete(record.storagePath).catch(() => {});
    await FileRecord.deleteOne({ _id: record._id });

    // Try to delete from Cloud if possible (Gofile free API doesn't support delete without account token, but we remove the local link)
    console.log(`[Burn] File ${shareId} has self-destructed.`);
    res.json({ status: 'burned' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
