'use strict';

const mongoose = require('mongoose');

const fileChunkSchema = new mongoose.Schema(
  {
    uploadSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UploadSession',
      required: true,
      index: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    chunkHash: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ['pending', 'uploading', 'success', 'failed'],
      default: 'pending',
    },
    storagePath: {
      type: String,
      default: null,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: 'file_chunks',
  }
);

// Enforce uniqueness per session + index pair
fileChunkSchema.index({ uploadSessionId: 1, chunkIndex: 1 }, { unique: true });

module.exports = mongoose.model('FileChunk', fileChunkSchema);
