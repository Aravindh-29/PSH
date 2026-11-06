const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error(err.message, err);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status >= 500 ? 'Internal server error' : err.message;
  res.status(status).json({ success: false, message, ...(err.code === 'PERMISSION_DENIED' ? {code:err.code} : {}) });
}

module.exports = errorHandler;
