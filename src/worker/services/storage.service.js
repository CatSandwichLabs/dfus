const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { google } = require('googleapis');
const config = require('../../config/env');
const { getDatabase } = require('../../repositories/database');

class StorageService {
  constructor() {
    this.storageKey = Buffer.from(config.STORAGE.ENCRYPTION_KEY || '12345678901234567890123456789012'); // 32 bytes fallback
    this.tempDir = path.join(__dirname, '../../../data/worker_tmp');
    
    if (config.MODE === 'cloud') {
      const oauth2Client = new google.auth.OAuth2(
        config.GOOGLE.CLIENT_ID,
        config.GOOGLE.CLIENT_SECRET
      );
      
      oauth2Client.setCredentials({
        refresh_token: config.GOOGLE.REFRESH_TOKEN
      });
      
      this.drive = google.drive({ version: 'v3', auth: oauth2Client });
    }
  }

  async initStorage() {
    await fs.promises.mkdir(this.tempDir, { recursive: true });
    // In cloud mode, no need for storageDir as we upload to Drive
    if (config.MODE !== 'cloud') {
      this.storageDir = path.join(__dirname, '../../../data/worker_chunks');
      await fs.promises.mkdir(this.storageDir, { recursive: true });
    }
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

    // 2. Compress & Encrypt to a temporary encrypted file
    const encFilePath = path.join(this.tempDir, `${chunkHash}.enc`);
    const iv = crypto.randomBytes(16);
    
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(rawFilePath);
      const gzip = zlib.createGzip();
      const cipher = crypto.createCipheriv('aes-256-gcm', this.storageKey, iv);
      const writeStream = fs.createWriteStream(encFilePath);

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
        fs.appendFileSync(encFilePath, authTag);
        resolve();
      });
    });

    let fileId = null;

    // 3. Upload to Google Drive if cloud mode
    if (config.MODE === 'cloud') {
      const fileMetadata = {
        name: `${chunkHash}.enc`,
        parents: [config.GOOGLE.DRIVE_FOLDER_ID]
      };
      
      const media = {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(encFilePath)
      };

      const driveRes = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id'
      });

      fileId = driveRes.data.id;
      
      // Cleanup the encrypted temp file
      fs.unlink(encFilePath, () => {});
    } else {
      // Local mode fallback
      const finalFilePath = path.join(this.storageDir, `${chunkHash}.enc`);
      await fs.promises.rename(encFilePath, finalFilePath);
    }

    // 4. Update MongoDB to say this worker has it
    const db = getDatabase();
    await db.addWorkerToChunk(chunkHash, config.WORKER.ID);

    // 5. Cleanup raw temp file
    fs.unlink(rawFilePath, () => {});

    return { workerId: config.WORKER.ID, fileId };
  }

  async handleDownload(chunkHash, outputStream) {
    let encFilePath;
    let isTemp = false;

    if (config.MODE === 'cloud') {
      // Query Drive for the file
      const res = await this.drive.files.list({
        q: `name='${chunkHash}.enc' and '${config.GOOGLE.DRIVE_FOLDER_ID}' in parents`,
        fields: 'files(id)',
        spaces: 'drive'
      });

      if (!res.data.files || res.data.files.length === 0) {
        throw new Error('Chunk file not found on Google Drive');
      }

      const fileId = res.data.files[0].id;
      encFilePath = path.join(this.tempDir, `${chunkHash}.enc`);
      isTemp = true;

      // Download it to temp file
      await new Promise(async (resolve, reject) => {
        try {
          const driveRes = await this.drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'stream' }
          );
          
          const writeStream = fs.createWriteStream(encFilePath);
          driveRes.data.pipe(writeStream);
          
          driveRes.data.on('error', reject);
          writeStream.on('error', reject);
          writeStream.on('finish', resolve);
        } catch (err) {
          reject(err);
        }
      });
    } else {
      encFilePath = path.join(this.storageDir, `${chunkHash}.enc`);
    }

    // Now read IV and AuthTag
    const stats = await fs.promises.stat(encFilePath).catch(() => null);
    if (!stats) throw new Error('Chunk file not found');
    if (stats.size < 32) throw new Error('Invalid encrypted chunk file');

    const fd = await fs.promises.open(encFilePath, 'r');
    
    const ivBuffer = Buffer.alloc(16);
    await fd.read(ivBuffer, 0, 16, 0);
    
    const authTagBuffer = Buffer.alloc(16);
    await fd.read(authTagBuffer, 0, 16, stats.size - 16);
    
    await fd.close();

    const readStream = fs.createReadStream(encFilePath, { start: 16, end: stats.size - 17 });
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.storageKey, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    const gunzip = zlib.createGunzip();

    // Pipe decryption & decompression to the response output stream
    readStream.pipe(decipher).pipe(gunzip).pipe(outputStream);

    return new Promise((resolve, reject) => {
      outputStream.on('finish', () => {
        if (isTemp) fs.unlink(encFilePath, () => {});
        resolve();
      });
      outputStream.on('error', (err) => {
        if (isTemp) fs.unlink(encFilePath, () => {});
        reject(err);
      });
      gunzip.on('error', reject);
      decipher.on('error', reject);
    });
  }

  async deleteChunk(chunkHash) {
    if (config.MODE === 'cloud') {
      const res = await this.drive.files.list({
        q: `name='${chunkHash}.enc' and '${config.GOOGLE.DRIVE_FOLDER_ID}' in parents`,
        fields: 'files(id)',
        spaces: 'drive'
      });

      if (res.data.files && res.data.files.length > 0) {
        const fileId = res.data.files[0].id;
        await this.drive.files.delete({ fileId });
      }
    } else {
      const finalFilePath = path.join(this.storageDir, `${chunkHash}.enc`);
      try {
        await fs.promises.unlink(finalFilePath);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
  }
}

module.exports = new StorageService();
