const mongoose = require('mongoose');

const ChunkSchema = new mongoose.Schema({
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true
  },
  chunkIndex: {
    type: Number,
    required: true
  },
  chunkHash: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  workerIds: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['pending', 'replicated', 'lost'],
    default: 'pending'
  },
  refCount: {
    type: Number,
    default: 1
  }
}, { timestamps: true });

ChunkSchema.index({ chunkHash: 1 });
ChunkSchema.index({ fileId: 1, chunkIndex: 1 });

module.exports = mongoose.model('Chunk', ChunkSchema);
