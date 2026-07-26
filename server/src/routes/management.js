'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const FileRecord = require('../models/FileRecord');
const { safeDelete } = require('../utils/pathUtils');

const router = express.Router();

// Middleware to authenticate editToken
async function requireEditToken(req, res, next) {
  const { shareId } = req.params;
  const editToken = req.headers['x-edit-token'];

  if (!editToken) {
    return res.status(401).json({ error: { message: 'Unauthorized. Missing editToken.', status: 401 } });
  }

  try {
    const fileRecord = await FileRecord.findOne({ shareId });
    if (!fileRecord) {
      return res.status(404).json({ error: { message: 'File not found', status: 404 } });
    }

    if (fileRecord.editToken !== editToken) {
      return res.status(403).json({ error: { message: 'Forbidden. Invalid editToken.', status: 403 } });
    }

    req.fileRecord = fileRecord;
    next();
  } catch (error) {
    res.status(500).json({ error: { message: 'Internal Server Error', status: 500 } });
  }
}

// Rename file
router.put('/:shareId/rename', requireEditToken, async (req, res) => {
  const { newName } = req.body;
  if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
    return res.status(400).json({ error: { message: 'Invalid new name', status: 400 } });
  }

  try {
    req.fileRecord.originalName = newName.trim();
    await req.fileRecord.save();
    res.json({ message: 'File renamed successfully', originalName: req.fileRecord.originalName });
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to rename file', status: 500 } });
  }
});

// Update password
router.put('/:shareId/password', requireEditToken, async (req, res) => {
  const { password } = req.body; // if empty, removes password
  
  try {
    if (password) {
      req.fileRecord.passwordHash = await bcrypt.hash(password, 10);
    } else {
      req.fileRecord.passwordHash = null;
    }
    await req.fileRecord.save();
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to update password', status: 500 } });
  }
});

// Delete file
router.delete('/:shareId', requireEditToken, async (req, res) => {
  try {
    // We try to safely delete the local file
    if (fs.existsSync(req.fileRecord.storagePath)) {
      await safeDelete(req.fileRecord.storagePath);
    }
    // Delete the database record
    await FileRecord.deleteOne({ _id: req.fileRecord._id });
    
    // Note: Since we upload to Gofile as an anonymous guest, we cannot delete it from Gofile via API.
    res.json({ message: 'File deleted locally and from database.' });
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to delete file', status: 500 } });
  }
});

module.exports = router;
