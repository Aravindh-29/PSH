const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/subcategoryController');

const router = express.Router();
router.get('/',           requireAuth,  ctrl.list);
router.get('/admin/all',  requireAdmin, ctrl.listAdmin);
router.post('/',          requireAdmin, ctrl.create);
router.put('/:id',        requireAdmin, ctrl.update);
router.delete('/:id',     requireAdmin, ctrl.remove);
module.exports = router;
