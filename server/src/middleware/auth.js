const logger = require('../utils/logger');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  if (req.session.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
