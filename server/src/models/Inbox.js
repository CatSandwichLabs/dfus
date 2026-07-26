'use strict';

const mongoose = require('mongoose');

const inboxSchema = new mongoose.Schema({
  inboxId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Inbox', inboxSchema);
