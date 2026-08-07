const { getDatabase } = require('../../repositories/database');
const { ValidationError, NotFoundError } = require('../../utils/errors');

const getMe = async (req, res) => {
  res.json({ user: req.user });
};

module.exports = {
  getMe
};
