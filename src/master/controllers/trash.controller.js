const trashService = require('../services/trash.service');

class TrashController {
  async listTrash(req, res) {
    const trashItems = await trashService.listTrash(req.user.userId);
    res.json({ trash: trashItems });
  }

  async moveToTrash(req, res) {
    const { itemId, type } = req.body;
    await trashService.moveToTrash(req.user.userId, itemId, type);
    res.status(204).send();
  }

  async restoreFromTrash(req, res) {
    const { trashId } = req.params;
    await trashService.restoreFromTrash(req.user.userId, trashId);
    res.status(204).send();
  }
}

module.exports = new TrashController();
