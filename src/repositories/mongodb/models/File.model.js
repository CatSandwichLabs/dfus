const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  originalName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    default: 'application/octet-stream'
  },
  size: {
    type: Number,
    required: true
  },
  merkleRoot: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['uploading', 'complete', 'failed'],
    default: 'uploading'
  },
  tags: {
    type: [String],
    default: []
  },
  shareToken: {
    type: String,
    sparse: true,
    unique: true
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  sharePasswordHash: {
    type: String,
    default: null
  },
  shareExpiresAt: {
    type: Date,
    default: null
  },
  downloadCount: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

FileSchema.index({ userId: 1, folderId: 1 });
FileSchema.index({ originalName: 'text', tags: 'text' });

module.exports = mongoose.model('File', FileSchema);
