const searchService = require('../services/search.service');

class SearchController {
  async search(req, res) {
    const { q, type, mimeType, minSize, maxSize, fromDate, toDate, tags, folderId, status, skip, limit } = req.query;
    const options = {
      text: q,
      type,
      mimeType,
      minSize,
      maxSize,
      fromDate,
      toDate,
      tags: tags ? tags.split(',') : [],
      folderId,
      status,
      skip,
      limit
    };
    
    const results = await searchService.searchFilesAndFolders(req.user.userId, options);
    res.json(results);
  }

  async getTags(req, res) {
    const tags = await searchService.getTags(req.user.userId);
    res.json(tags);
  }
}

module.exports = new SearchController();
