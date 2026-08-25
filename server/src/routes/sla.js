const express = require('express');
const router  = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/slaController');

router.get('/settings',                requireAdmin, ctrl.getSettings);
router.put('/settings',                requireAdmin, ctrl.toggleSettings);
router.post('/apply-defaults',         requireAdmin, ctrl.applyDefaults);
router.get('/definitions',             requireAuth,  ctrl.listDefinitions);
router.post('/definitions',            requireAdmin, ctrl.createDefinition);
router.put('/definitions/:id',         requireAdmin, ctrl.updateDefinition);
router.delete('/definitions/:id',      requireAdmin, ctrl.deleteDefinition);
router.get('/ticket/:ticketId',        requireAuth,  ctrl.getTicketSLAInstances);
router.get('/breached',                requireAdmin, ctrl.getBreachedTickets);
router.get('/qa',                      requireAdmin, ctrl.getQAStats);
router.get('/drill',                   requireAdmin, ctrl.getDrillInstances);

module.exports = router;
