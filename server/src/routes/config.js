const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const configCtrl       = require('../controllers/configController');
const ssoConfigCtrl    = require('../controllers/ssoConfigController');
const emailConfigCtrl  = require('../controllers/emailConfigController');

const templateCtrl = require('../controllers/templateController');
const brandingCtrl = require('../controllers/brandingController');
const router = express.Router();
const mcpConfigCtrl = require('../controllers/mcpConfigController');
router.get('/branding/public', brandingCtrl.get);
router.use(requireAuth);
router.use('/admin/mcp',mcpConfigCtrl.admin);
const emailAICtrl=require('../controllers/emailAIController');
router.get('/admin/mcp/ai',emailAICtrl.get);
router.post('/admin/mcp/ai/providers',emailAICtrl.save);
router.post('/admin/mcp/ai/test',emailAICtrl.test);
router.post('/admin/mcp/ai/activate',emailAICtrl.activate);
const gmailConfigCtrl=require('../controllers/gmailConfigController');
router.get('/admin/mcp/gmail',gmailConfigCtrl.get);
router.get('/admin/mcp/gmail/queue',gmailConfigCtrl.queueStatus);
router.post('/admin/mcp/gmail/settings',gmailConfigCtrl.save);
router.post('/admin/mcp/gmail/connect',gmailConfigCtrl.connect);
router.get('/admin/mcp/gmail/callback',gmailConfigCtrl.callback);
router.post('/admin/mcp/gmail/mailboxes/:id',gmailConfigCtrl.action);
router.post('/admin/mcp/gmail/mailboxes/:id/retry',gmailConfigCtrl.retry);
router.get('/admin/mcp',mcpConfigCtrl.get);
router.post('/admin/mcp',mcpConfigCtrl.save);
router.post('/admin/mcp/test',mcpConfigCtrl.test);
router.post('/admin/mcp/credentials/copy',mcpConfigCtrl.copyCredential);
router.post('/admin/mcp/mailboxes',mcpConfigCtrl.saveMailbox);
router.put('/admin/mcp/mailboxes/:id',mcpConfigCtrl.saveMailbox);

// Authenticated endpoints used by ticket forms
router.get('/branding', brandingCtrl.get);
router.put('/admin/branding', requireAdmin, brandingCtrl.save);

router.get('/templates', templateCtrl.list);
router.post('/admin/templates', requireAdmin, templateCtrl.save);
router.put('/admin/templates/:id', requireAdmin, templateCtrl.save);

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

// Email configuration (admin only)
router.get ('/admin/email',      requireAdmin, emailConfigCtrl.getConfig);
router.post('/admin/email',      requireAdmin, emailConfigCtrl.saveConfig);
router.post('/admin/email/test', requireAdmin, emailConfigCtrl.testConfig);
router.get('/admin/email/deliveries', requireAdmin, emailConfigCtrl.deliveries);
router.post('/admin/email/retry/:id', requireAdmin, emailConfigCtrl.retry);

module.exports = router;
