const mongoose = require('mongoose');

const WorkerSchema = new mongoose.Schema({
  workerId: {
    type: String,
    required: true,
    unique: true
  },
  host: {
    type: String,
    required: true
  },
  port: {
    type: Number,
    required: true
  },
  publicUrl: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['alive', 'suspect', 'dead'],
    default: 'alive'
  },
  lastHeartbeat: {
    type: Date,
    default: Date.now
  },
  metrics: {
    cpuUsage: { type: Number, default: 0 },
    memoryUsage: { type: Number, default: 0 },
    diskUsage: { type: Number, default: 0 },
    chunksStored: { type: Number, default: 0 },
    cacheHitRate: { type: Number, default: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('Worker', WorkerSchema);
