const mongoose = require('mongoose');
const config = require('../../../config/env');

const UploadSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    ref: 'User',
    required: true
  },
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true
  },
  totalChunks: {
    type: Number,
    required: true
  },
  chunkStatus: {
    type: [Boolean], // Array mapping index -> isCompleted
    default: []
  },
  dedupSavedBytes: {
    type: Number,
    default: 0
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true });

// TTL index on expiresAt (e.g., 24 hours TTL auto-cleanup)
UploadSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('UploadSession', UploadSessionSchema);
