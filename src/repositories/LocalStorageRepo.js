const fs = require('fs').promises;
const path = require('path');
const IStorageRepository = require('./IStorageRepository');
const { StorageError } = require('../utils/errors');
const config = require('../config/env');

class LocalStorageRepo extends IStorageRepository {
  constructor(workerId) {
    super();
    this.workerId = workerId;
    this.baseDir = path.join(__dirname, '../../data/chunks', workerId || 'default');
  }

  _getChunkPath(chunkHash) {
    const prefix = chunkHash.substring(0, 2);
    return path.join(this.baseDir, prefix, chunkHash);
  }

  async _ensureDir(filePath) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  async storeChunk(chunkHash, dataBuffer) {
    try {
      const filePath = this._getChunkPath(chunkHash);
      await this._ensureDir(filePath);
      await fs.writeFile(filePath, dataBuffer);
    } catch (err) {
      throw new StorageError(`Failed to store chunk locally: ${err.message}`);
    }
  }

  async retrieveChunk(chunkHash) {
    try {
      const filePath = this._getChunkPath(chunkHash);
      return await fs.readFile(filePath);
    } catch (err) {
      throw new StorageError(`Failed to read chunk locally: ${err.message}`);
    }
  }

  async deleteChunk(chunkHash) {
    try {
      const filePath = this._getChunkPath(chunkHash);
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw new StorageError(`Failed to delete chunk locally: ${err.message}`);
      }
    }
  }

  async chunkExists(chunkHash) {
    try {
      const filePath = this._getChunkPath(chunkHash);
      await fs.access(filePath);
      return true;
    } catch (err) {
      return false;
    }
  }

  async getStorageStats() {
    let totalChunks = 0;
    let totalBytes = 0;
    
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      const prefixes = await fs.readdir(this.baseDir);
      for (const prefix of prefixes) {
        const prefixPath = path.join(this.baseDir, prefix);
        const stat = await fs.stat(prefixPath);
        if (stat.isDirectory()) {
          const files = await fs.readdir(prefixPath);
          for (const file of files) {
            const fileStat = await fs.stat(path.join(prefixPath, file));
            totalChunks++;
            totalBytes += fileStat.size;
          }
        }
      }
    } catch (err) {
      // Ignore if dir doesn't exist
    }

    return { totalChunks, totalBytes };
  }
}

module.exports = LocalStorageRepo;
