const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const configCtrl    = require('../controllers/configController');
const ssoConfigCtrl = require('../controllers/ssoConfigController');

const router = express.Router();
router.use(requireAuth);

// Authenticated endpoints used by ticket forms
router.get('/fields', configCtrl.getFields);
router.get('/modules', configCtrl.getModules);
router.get('/categories', configCtrl.getCategories);
router.get('/users', configCtrl.getUsers);
router.get('/ticket-types', configCtrl.getTicketTypes);

// Admin-only configuration management
router.get('/admin/fields', requireAdmin, configCtrl.getAdminFields);
router.post('/admin/fields', requireAdmin, configCtrl.createField);
router.put('/admin/fields/:id', requireAdmin, configCtrl.updateField);
router.delete('/admin/fields/:id', requireAdmin, configCtrl.deleteField);

router.post('/admin/categories', requireAdmin, configCtrl.createCategory);
router.put('/admin/categories/:id', requireAdmin, configCtrl.updateCategory);
router.delete('/admin/categories/:id', requireAdmin, configCtrl.deleteCategory);
router.post('/admin/reset-fields', requireAdmin, configCtrl.resetFields);

// Ticket types (admin CRUD)
router.get('/admin/ticket-types', requireAdmin, configCtrl.getAdminTicketTypes);
router.post('/admin/ticket-types', requireAdmin, configCtrl.createTicketType);
router.put('/admin/ticket-types/:id', requireAdmin, configCtrl.updateTicketType);
router.delete('/admin/ticket-types/:id', requireAdmin, configCtrl.deleteTicketType);

// SSO configuration (admin only)
router.get   ('/admin/sso',      requireAdmin, ssoConfigCtrl.getSSOConfig);
router.post  ('/admin/sso',      requireAdmin, ssoConfigCtrl.saveSSOConfig);
router.post  ('/admin/sso/test', requireAdmin, ssoConfigCtrl.testSSOConnection);
router.delete('/admin/sso',      requireAdmin, ssoConfigCtrl.clearSSOConfig);

module.exports = router;
