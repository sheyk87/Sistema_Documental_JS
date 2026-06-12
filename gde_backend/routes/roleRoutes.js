// routes/roleRoutes.js
const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const authMiddleware = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');

// Protegemos todas las rutas de este módulo a nivel de permisos de roles (OWASP A01: Broken Access Control)
router.use(authMiddleware);
router.use(requirePermission('admin_manage_roles'));

router.get('/permissions', roleController.getPermissions);
router.get('/', roleController.getAllRoles);
router.post('/create', roleController.createRole);
router.put('/update/:id', roleController.updateRole);
router.delete('/delete/:id', roleController.deleteRole);

module.exports = router;
