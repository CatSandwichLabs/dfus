const { getDatabase } = require('../../repositories/database');

class SearchService {
  constructor() {
    this.db = getDatabase();
  }

  async searchFilesAndFolders(userId, options) {
    let files = [];
    let folders = [];

    const type = options.type;

    if (!type || type === 'file' || type === 'all') {
      if (this.db.searchFiles) {
        files = await this.db.searchFiles(userId, options);
      }
    }

    if (!type || type === 'folder' || type === 'all') {
      if (this.db.searchFolders) {
        folders = await this.db.searchFolders(userId, options);
      }
    }

    return { files, folders };
  }

  async getTags(userId) {
    if (this.db.getTags) {
      return await this.db.getTags(userId);
    }
    return [];
  }
}

module.exports = new SearchService();
