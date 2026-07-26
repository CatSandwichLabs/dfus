'use strict';

const mongoose = require('mongoose');

const uploadSessionSchema = new mongoose.Schema(
  {
    fileHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => /^[a-f0-9]{64}$/.test(v),
        message: 'fileHash must be a 64-character lowercase hex string (SHA-256)',
      },
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 512,
    },
    totalChunks: {
      type: Number,
      required: true,
      min: 0,
      max: 500000,
    },
    fileSizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'uploading', 'merging', 'complete', 'failed'],
      default: 'pending',
    },
    finalPath: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'upload_sessions',
  }
);

module.exports = mongoose.model('UploadSession', uploadSessionSchema);
