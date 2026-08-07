const { ValidationError } = require('../utils/errors');

module.exports = (schema) => (req, res, next) => {
  // Simple validation middleware stub
  // In a real application, you'd use Joi, express-validator, or Zod here
  next();
};
