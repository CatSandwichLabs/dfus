const { getDatabase } = require('../../repositories/database');

class SearchService {
  constructor() {
    this.db = getDatabase();
  }

  async searchFilesAndFolders(userId, query, type) {
    if (!query) {
      return { files: [], folders: [] };
    }

    let files = [];
    let folders = [];

    if (!type || type === 'file' || type === 'all') {
      if (this.db.searchFiles) {
        files = await this.db.searchFiles(userId, query);
      }
    }

    if (!type || type === 'folder' || type === 'all') {
      if (this.db.searchFolders) {
        folders = await this.db.searchFolders(userId, query);
      }
    }

    return { files, folders };
  }
}

module.exports = new SearchService();
