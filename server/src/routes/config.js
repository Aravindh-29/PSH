const express = require('express');
const { requireAuth } = require('../middleware/auth');
const configCtrl = require('../controllers/configController');

const router = express.Router();
router.use(requireAuth);
router.get('/modules', configCtrl.getModules);
router.get('/categories', configCtrl.getCategories);
router.get('/users', configCtrl.getUsers);
module.exports = router;
