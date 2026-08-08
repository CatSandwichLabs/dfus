const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  firebaseUid: {
    type: String,
    unique: true,
    sparse: true
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    sparse: true
  },
  passwordHash: {
    type: String,
    required: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  storageUsed: {
    type: Number,
    default: 0
  },
  storageQuota: {
    type: Number,
    required: true
  },
  has2FA: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String,
    default: null
  },
  backupCodes: {
    type: [String],
    default: []
  },
  lastLoginAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
