const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const config = require('../../config/env');
const { getDatabase } = require('../../repositories/database');

class StorageService {
  constructor() {
    this.s3Client = new S3Client({
      region: config.S3.REGION,
      endpoint: config.S3.ENDPOINT,
      credentials: {
        accessKeyId: config.S3.ACCESS_KEY,
        secretAccessKey: config.S3.SECRET_KEY,
      },
      forcePathStyle: true // Important for minio/r2
    });
    this.bucketName = config.S3.BUCKET;
    this.storageKey = Buffer.from(config.STORAGE.ENCRYPTION_KEY || '12345678901234567890123456789012'); // 32 bytes fallback
    this.tempDir = path.join(__dirname, '../../../data/worker_tmp');
  }

  async initStorage() {
    await fs.promises.mkdir(this.tempDir, { recursive: true });
  }

  _getS3Key(chunkHash) {
    // We can group them by first 2 chars of hash
    const prefix = chunkHash.substring(0, 2);
    return `${config.WORKER.ID}/${prefix}/${chunkHash}`;
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

    // 2. Compress & Encrypt to stream
    const processedFilePath = path.join(this.tempDir, `${chunkHash}.enc`);
    const iv = crypto.randomBytes(16);
    
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(rawFilePath);
      const gzip = zlib.createGzip();
      const cipher = crypto.createCipheriv('aes-256-gcm', this.storageKey, iv);
      const writeStream = fs.createWriteStream(processedFilePath);

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
        fs.appendFileSync(processedFilePath, authTag);
        resolve();
      });
    });

    // 3. Upload to R2
    const fileStream = fs.createReadStream(processedFilePath);
    const s3Key = this._getS3Key(chunkHash);

    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileStream
      }
    });

    await upload.done();

    // 4. Update MongoDB to say this worker has it
    const db = getDatabase();
    await db.addWorkerToChunk(chunkHash, config.WORKER.ID);

    // 5. Cleanup
    fs.unlink(rawFilePath, () => {});
    fs.unlink(processedFilePath, () => {});

    return { s3Key, workerId: config.WORKER.ID };
  }

  async handleDownload(chunkHash, outputStream) {
    const s3Key = this._getS3Key(chunkHash);

    const { Body } = await this.s3Client.send(new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key
    }));

    // The stream from S3 contains IV (16 bytes) + Encrypted Data + AuthTag (16 bytes)
    // Unfortunately, we need the AuthTag to decrypt GCM securely.
    // If we stream, we can't easily extract AuthTag at the end until we reach it.
    // Let's write to a temp file, decrypt & decompress.
    const encFilePath = path.join(this.tempDir, `${chunkHash}_down.enc`);
    
    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(encFilePath);
      Body.pipe(writeStream);
      Body.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
    });

    // Now read IV and AuthTag
    const stats = await fs.promises.stat(encFilePath);
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
        fs.unlink(encFilePath, () => {});
        resolve();
      });
      outputStream.on('error', (err) => {
        fs.unlink(encFilePath, () => {});
        reject(err);
      });
      gunzip.on('error', reject);
      decipher.on('error', reject);
    });
  }

  async deleteChunk(chunkHash) {
    const s3Key = this._getS3Key(chunkHash);
    await this.s3Client.send(new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key
    }));
  }
}

module.exports = new StorageService();
