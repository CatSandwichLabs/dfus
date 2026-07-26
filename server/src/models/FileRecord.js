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
  selfDestruct: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  downloadCount: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    required: false,
  },
  geoblockCity: { type: String, default: '' },
  maxDownloads: { type: Number, default: 0 },
  webhookUrl: { type: String, default: null },
  targetInboxId: { type: String, default: null }
}, {
  timestamps: true,
});

// Automatically delete records that have expired via TTL index
fileRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('FileRecord', fileRecordSchema);
