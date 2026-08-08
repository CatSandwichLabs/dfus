const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const config = require('../../config/env');
const { getDatabase } = require('../../repositories/database');

class StorageService {
  constructor() {
    this.storageKey = Buffer.from(config.STORAGE.ENCRYPTION_KEY || '12345678901234567890123456789012'); // 32 bytes fallback
    this.tempDir = path.join(__dirname, '../../../data/worker_tmp');
    this.storageDir = path.join(__dirname, '../../../data/worker_chunks');
  }

  async initStorage() {
    await fs.promises.mkdir(this.tempDir, { recursive: true });
    await fs.promises.mkdir(this.storageDir, { recursive: true });
  }

  async handleUpload(chunkHash, inputStream) {
    const rawFilePath = path.join(this.tempDir, `${chunkHash}.raw`);
    
    // 1. Write to raw temp file & calculate hash
    await new Promise((resolve, reject) => {
      const hasher = crypto.createHash('sha256');
      const writeStream = fs.createWriteStream(rawFilePath);
      
      inputStream.on('data', (chunk) => hasher.update(chunk));
      
      inputStream.pipe(writeStream);
      
      inputStream.on('error', reject);
      writeStream.on('error', reject);
      
      writeStream.on('finish', () => {
        const calculatedHash = hasher.digest('hex');
        if (calculatedHash !== chunkHash) {
          fs.unlink(rawFilePath, () => {});
          return reject(new Error('Chunk hash mismatch'));
        }
        resolve();
      });
    });

    // 2. Compress & Encrypt to stream directly to storage directory
    const finalFilePath = path.join(this.storageDir, `${chunkHash}.enc`);
    const iv = crypto.randomBytes(16);
    
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(rawFilePath);
      const gzip = zlib.createGzip();
      const cipher = crypto.createCipheriv('aes-256-gcm', this.storageKey, iv);
      const writeStream = fs.createWriteStream(finalFilePath);

      // Write IV at the beginning of the file so we can decrypt later
      writeStream.write(iv);

      readStream.pipe(gzip).pipe(cipher).pipe(writeStream);

      readStream.on('error', reject);
      gzip.on('error', reject);
      cipher.on('error', reject);
      writeStream.on('error', reject);

      writeStream.on('finish', () => {
        const authTag = cipher.getAuthTag();
        // Append auth tag at the end (16 bytes)
        fs.appendFileSync(finalFilePath, authTag);
        resolve();
      });
    });

    // 3. Update MongoDB to say this worker has it
    const db = getDatabase();
    await db.addWorkerToChunk(chunkHash, config.WORKER.ID);

    // 4. Cleanup
    fs.unlink(rawFilePath, () => {});

    return { workerId: config.WORKER.ID, path: finalFilePath };
  }

  async handleDownload(chunkHash, outputStream) {
    const finalFilePath = path.join(this.storageDir, `${chunkHash}.enc`);

    // Now read IV and AuthTag
    const stats = await fs.promises.stat(finalFilePath).catch(() => null);
    if (!stats) throw new Error('Chunk file not found');
    if (stats.size < 32) throw new Error('Invalid encrypted chunk file');

    const fd = await fs.promises.open(finalFilePath, 'r');
    
    const ivBuffer = Buffer.alloc(16);
    await fd.read(ivBuffer, 0, 16, 0);
    
    const authTagBuffer = Buffer.alloc(16);
    await fd.read(authTagBuffer, 0, 16, stats.size - 16);
    
    await fd.close();

    const readStream = fs.createReadStream(finalFilePath, { start: 16, end: stats.size - 17 });
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.storageKey, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    const gunzip = zlib.createGunzip();

    // Pipe decryption & decompression to the response output stream
    readStream.pipe(decipher).pipe(gunzip).pipe(outputStream);

    return new Promise((resolve, reject) => {
      outputStream.on('finish', resolve);
      outputStream.on('error', reject);
      gunzip.on('error', reject);
      decipher.on('error', reject);
    });
  }

  async deleteChunk(chunkHash) {
    const finalFilePath = path.join(this.storageDir, `${chunkHash}.enc`);
    try {
      await fs.promises.unlink(finalFilePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

module.exports = new StorageService();
