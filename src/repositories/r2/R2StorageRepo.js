const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const IStorageRepository = require('../interfaces/IStorageRepository');
const { StorageError } = require('../../utils/errors');
const config = require('../../config/env');

class R2StorageRepo extends IStorageRepository {
  constructor(workerId) {
    super();
    this.workerId = workerId;
    this.bucket = config.R2_BUCKET_NAME;
    
    if (!config.R2_ACCOUNT_ID || !config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 credentials missing from environment');
    }

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async connect() {
    // S3Client does not need an explicit connect call, but we can verify bucket access
    return true;
  }

  async uploadChunk(chunkId, dataStream, size) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: `chunks/${chunkId}`,
        Body: dataStream,
        ContentLength: size
      });
      await this.s3Client.send(command);
    } catch (err) {
      throw new StorageError(`Failed to upload chunk to R2: ${err.message}`);
    }
  }

  async downloadChunk(chunkId) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: `chunks/${chunkId}`
      });
      const response = await this.s3Client.send(command);
      return response.Body; // Node.js Readable stream
    } catch (err) {
      throw new StorageError(`Failed to download chunk from R2: ${err.message}`);
    }
  }

  async deleteChunk(chunkId) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: `chunks/${chunkId}`
      });
      await this.s3Client.send(command);
    } catch (err) {
      throw new StorageError(`Failed to delete chunk from R2: ${err.message}`);
    }
  }
}

module.exports = R2StorageRepo;
