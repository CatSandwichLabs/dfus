const searchService = require('../services/search.service');

class SearchController {
  async search(req, res) {
    const { q, type } = req.query;
    const results = await searchService.searchFilesAndFolders(req.user.userId, q, type);
    res.json(results);
  }
}

module.exports = new SearchController();
