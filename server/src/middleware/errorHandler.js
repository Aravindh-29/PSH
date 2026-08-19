const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error(err.message, err);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(status).json({ success: false, message });
}

module.exports = errorHandler;
