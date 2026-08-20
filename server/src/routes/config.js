const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const configCtrl = require('../controllers/configController');

const router = express.Router();
router.use(requireAuth);

// Authenticated endpoints used by ticket forms
router.get('/fields', configCtrl.getFields);
router.get('/modules', configCtrl.getModules);
router.get('/categories', configCtrl.getCategories);
router.get('/users', configCtrl.getUsers);

// Admin-only configuration management
router.get('/admin/fields', requireAdmin, configCtrl.getAdminFields);
router.post('/admin/fields', requireAdmin, configCtrl.createField);
router.put('/admin/fields/:id', requireAdmin, configCtrl.updateField);
router.delete('/admin/fields/:id', requireAdmin, configCtrl.deleteField);

router.post('/admin/categories', requireAdmin, configCtrl.createCategory);
router.put('/admin/categories/:id', requireAdmin, configCtrl.updateCategory);
router.delete('/admin/categories/:id', requireAdmin, configCtrl.deleteCategory);
router.post('/admin/reset-fields', requireAdmin, configCtrl.resetFields);

module.exports = router;
