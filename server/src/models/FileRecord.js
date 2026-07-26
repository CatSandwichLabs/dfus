'use strict';

const mongoose = require('mongoose');

const fileRecordSchema = new mongoose.Schema({
  shareId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  editToken: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  storagePath: {
    type: String,
    required: true,
  },
  sizeBytes: {
    type: Number,
    required: true,
  },
  fileHash: {
    type: String,
    required: true,
  },
  isFolder: {
    type: Boolean,
    default: false,
  },
  passwordHash: { type: String, default: null },
  cloudUrl: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  downloadCount: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
  }
}, {
  timestamps: true,
});

// Automatically delete records that have expired via TTL index
fileRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('FileRecord', fileRecordSchema);
