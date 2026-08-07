const mongoose = require('mongoose');

const VersionSchema = new mongoose.Schema({
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true
  },
  versionNumber: {
    type: Number,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  checksum: {
    type: String,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Version', VersionSchema);
