const mongoose = require('mongoose');

const FolderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  name: {
    type: String,
    required: true,
    trim: true
  }
}, { timestamps: true });

// Prevent duplicate folder names under the same parent for the same user
FolderSchema.index({ userId: 1, parentId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Folder', FolderSchema);
