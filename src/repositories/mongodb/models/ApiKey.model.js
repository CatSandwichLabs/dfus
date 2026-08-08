const mongoose = require('mongoose');

const ApiKeySchema = new mongoose.Schema({
  userId: {
    type: String,
    ref: 'User',
    required: true
  },
  keyHash: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  lastUsedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('ApiKey', ApiKeySchema);
