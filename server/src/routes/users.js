const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const userCtrl = require('../controllers/userController');

const router = express.Router();
router.get('/', requireAuth, userCtrl.list);
router.post('/', requireAdmin, userCtrl.create);
router.get('/:id', requireAdmin, userCtrl.getOne);
router.put('/:id', requireAdmin, userCtrl.update);
router.post('/:id/reset-password', requireAdmin, userCtrl.resetPassword);
router.delete('/:id', requireAdmin, userCtrl.deleteUser);
router.delete('/:id/tickets', requireAdmin, userCtrl.deleteAllTickets);
router.post('/bulk', requireAdmin, userCtrl.bulkCreate);
module.exports = router;
