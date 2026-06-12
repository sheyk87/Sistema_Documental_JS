const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validateCreateUser, validateUpdateUser, validateProfileUpdate } = require('../middlewares/validationMiddleware');

// OWASP A01: Solo admin puede crear, actualizar y eliminar usuarios
router.post('/create', authMiddleware, requirePermission('admin_users'), validateCreateUser, userController.createUser);
router.put('/update/:id', authMiddleware, requirePermission('admin_users'), validateUpdateUser, userController.updateUser);
router.delete('/delete/:id', authMiddleware, requirePermission('admin_users'), userController.deleteUser);
router.post('/bulk', authMiddleware, requirePermission('admin_users'), userController.bulkCreateUsers);

// Rutas de usuario normal
router.get('/me', authMiddleware, userController.getMe);
router.put('/profile', authMiddleware, validateProfileUpdate, userController.updateProfile);

module.exports = router;