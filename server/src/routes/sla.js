const express = require('express');
const router  = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/slaController');

router.get('/definitions',             requireAuth, ctrl.listDefinitions);
router.post('/definitions',            requireAdmin, ctrl.createDefinition);
router.put('/definitions/:id',         requireAdmin, ctrl.updateDefinition);
router.delete('/definitions/:id',      requireAdmin, ctrl.deleteDefinition);
router.get('/ticket/:ticketId',        requireAuth, ctrl.getTicketSLAInstances);
router.get('/breached',                requireAdmin, ctrl.getBreachedTickets);

module.exports = router;
