const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/env');
const { getDatabase } = require('../../repositories/database');
const { processFileStream } = require('../../services/chunker');
const { downloadFile: streamDownload } = require('../../services/chunk.service');
const { ValidationError, QuotaExceededError, NotFoundError } = require('../../utils/errors');

const uploadFile = async (req, res) => {
  if (!req.file) {
    throw new ValidationError('No file provided');
  }

  const db = getDatabase();
  const fileId = uuidv4();
  const user = req.user;

  // Check Quota
  const newTotal = (user.storageUsed || 0) + req.file.size;
  if (newTotal > user.storageQuota) {
    fs.unlinkSync(req.file.path);
    throw new QuotaExceededError();
  }

  const totalChunks = Math.ceil(req.file.size / config.STORAGE.CHUNK_SIZE);

  // Create initial file record
  await db.createFile({
    id: fileId,
    userId: user.id,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    totalSize: req.file.size,
    chunkSize: config.STORAGE.CHUNK_SIZE,
    totalChunks: totalChunks,
    status: 'uploading'
  });

  try {
    // Process file stream into chunks
    const fileStream = fs.createReadStream(req.file.path);
    const chunkMetadata = await processFileStream(fileStream, fileId);

    // If successful, update file status
    await db.updateFileStatus(fileId, 'active');
    
    // Update user storage
    await db.updateUser(user.id, { storageUsed: newTotal });

    // Cleanup temp file
    fs.unlinkSync(req.file.path);

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        id: fileId,
        originalName: req.file.originalname,
        size: req.file.size,
        chunks: chunkMetadata.length
      }
    });
  } catch (err) {
    // Cleanup on failure
    await db.updateFileStatus(fileId, 'failed');
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    throw err; // Forward to error handler
  }
};

const downloadFile = async (req, res) => {
  const { fileId } = req.params;
  const db = getDatabase();
  
  const file = await db.findFileById(fileId);
  if (!file) throw new NotFoundError('File not found');
  
  // Authorization (unless public, which we can add later)
  if (file.userId !== req.user.id && !file.isPublic) {
    throw new NotFoundError('File not found');
  }

  await streamDownload(fileId, res);
};

const listFiles = async (req, res) => {
  const db = getDatabase();
  const files = await db.findFilesByUserId(req.user.id);
  res.json({ files });
};

const deleteFile = async (req, res) => {
  const { fileId } = req.params;
  const db = getDatabase();
  
  const file = await db.findFileById(fileId);
  if (!file) throw new NotFoundError('File not found');
  if (file.userId !== req.user.id) throw new NotFoundError('File not found');

  // We delete metadata. Orphaned chunks cleanup can be a cron job later.
  await db.deleteFile(fileId);
  
  // Free up quota
  const newStorage = Math.max(0, (req.user.storageUsed || 0) - file.totalSize);
  await db.updateUser(req.user.id, { storageUsed: newStorage });

  res.status(204).send();
};

module.exports = {
  uploadFile,
  downloadFile,
  listFiles,
  deleteFile
};
