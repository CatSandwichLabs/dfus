const { getDatabase } = require('../../repositories/database');
const { NotFoundError } = require('../../utils/errors');
const fileService = require('./file.service');
const fetch = require('node-fetch');

class PreviewService {
  constructor() {
    this.db = getDatabase();
  }

  async generatePreview(userId, fileId) {
    const file = await this.db.findFileById(fileId);
    if (!file || file.userId.toString() !== userId) throw new NotFoundError('File not found');

    if (file.mimeType && file.mimeType.startsWith('text/')) {
      const manifest = await fileService.getDownloadManifest(fileId, userId);
      if (manifest.chunks && manifest.chunks.length > 0) {
        const firstChunk = manifest.chunks[0];
        const response = await fetch(firstChunk.url, {
          headers: {
            'Authorization': `Bearer ${firstChunk.token}`
          }
        });
        if (!response.ok) {
          throw new Error('Failed to fetch chunk from worker');
        }
        const text = await response.text();
        const lines = text.split('\n').slice(0, 200).join('\n');
        return { status: 'success', type: 'text', content: lines };
      }
    }

    if (file.mimeType && file.mimeType.startsWith('image/')) {
      // Stub for images
      return { status: 'success', type: 'image', url: '/placeholder-image.png' };
    }
    
    return { status: 'pending', url: null };
  }
}

module.exports = new PreviewService();
