'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const Inbox = require('../models/Inbox');
const FileRecord = require('../models/FileRecord');

const router = express.Router();

// POST /api/inbox/create
router.post('/create', async (req, res, next) => {
  try {
    const { inboxId, password } = req.body || {};
    
    if (!inboxId || !password) {
      return res.status(400).json({ error: 'inboxId and password are required' });
    }

    const existing = await Inbox.findOne({ inboxId: inboxId.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'This Inbox ID is already taken.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newInbox = new Inbox({
      inboxId,
      passwordHash
    });

    await newInbox.save();
    res.json({ message: 'Inbox created successfully', inboxId });
  } catch (err) {
    next(err);
  }
});

// POST /api/inbox/login
router.post('/login', async (req, res, next) => {
  try {
    const { inboxId, password } = req.body || {};
    
    if (!inboxId || !password) {
      return res.status(400).json({ error: 'inboxId and password are required' });
    }

    const inbox = await Inbox.findOne({ inboxId: inboxId.toLowerCase() });
    if (!inbox) {
      return res.status(404).json({ error: 'Inbox not found.' });
    }

    const isMatch = await bcrypt.compare(password, inbox.passwordHash);
    if (!isMatch) {
      return res.status(403).json({ error: 'Incorrect password.' });
    }

    // Fetch all files received by this inbox
    const files = await FileRecord.find({ targetInboxId: inboxId.toLowerCase() }).sort({ createdAt: -1 });

    // Format them for the frontend
    const payload = files.map(f => ({
      shareId: f.shareId,
      originalName: f.originalName,
      sizeBytes: f.sizeBytes,
      isFolder: f.isFolder,
      createdAt: f.createdAt,
      expiresAt: f.expiresAt
    }));

    res.json({ message: 'Login successful', files: payload });
  } catch (err) {
    next(err);
  }
});

// POST /api/inbox/verify
// Checks if an inbox exists so the uploader can target it.
router.post('/verify', async (req, res, next) => {
  try {
    const { inboxId } = req.body || {};
    if (!inboxId) return res.status(400).json({ error: 'inboxId required' });

    const inbox = await Inbox.findOne({ inboxId: inboxId.toLowerCase() });
    if (!inbox) {
      return res.status(404).json({ error: 'Inbox not found' });
    }

    res.json({ valid: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
