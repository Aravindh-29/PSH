const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/groupController');

const router = express.Router();
router.get('/',                       requireAuth,  ctrl.list);
router.get('/with-members',           requireAuth,  ctrl.listWithMembers);
router.get('/:id',                    requireAdmin, ctrl.getOne);
router.post('/',                      requireAdmin, ctrl.create);
router.put('/:id',                    requireAdmin, ctrl.update);
router.delete('/:id',                 requireAdmin, ctrl.remove);
router.put('/:id/members',            requireAdmin, ctrl.setMembers);
router.post('/:id/members',           requireAdmin, ctrl.addMember);
router.delete('/:id/members/:userId', requireAdmin, ctrl.removeMember);
module.exports = router;
