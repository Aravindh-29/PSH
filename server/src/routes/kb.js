const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const kbCtrl = require('../controllers/kbController');

const router = express.Router();
router.get('/',             requireAuth,  kbCtrl.list);
router.get('/admin/all',    requireAdmin, kbCtrl.listAdmin);
router.get('/slug/:slug',   requireAuth,  kbCtrl.getBySlug);
router.get('/:id',          requireAuth,  kbCtrl.getOne);
router.post('/',            requireAdmin, kbCtrl.create);
router.put('/:id',          requireAdmin, kbCtrl.update);
router.delete('/:id',       requireAdmin, kbCtrl.remove);
module.exports = router;
