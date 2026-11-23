const router=require('express').Router(),{requireAuth}=require('../middleware/auth'),c=require('../controllers/departmentController');
router.use(requireAuth);
router.get('/tree',c.tree);router.get('/geography',c.geography);router.post('/geography',c.saveGeography);
router.get('/settings',c.settings);router.put('/settings',c.settings);
router.get('/candidates',c.candidates);router.post('/members',c.add);
router.get('/:id/members',c.members);router.post('/:id/members',c.add);router.delete('/:id/members/:userId',c.removeMember);
router.get('/:id',c.detail);router.post('/',c.save);router.put('/:id',c.save);router.delete('/:id',c.remove);
module.exports=router;
