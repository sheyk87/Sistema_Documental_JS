const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const { requireAdmin } = require('../middlewares/roleMiddleware');
const { validateCreateUser, validateUpdateUser, validateProfileUpdate } = require('../middlewares/validationMiddleware');

// OWASP A01: Solo admin puede crear, actualizar y eliminar usuarios
router.post('/create', authMiddleware, requireAdmin, validateCreateUser, userController.createUser);
router.put('/update/:id', authMiddleware, requireAdmin, validateUpdateUser, userController.updateUser);
router.delete('/delete/:id', authMiddleware, requireAdmin, userController.deleteUser);
router.post('/bulk', authMiddleware, requireAdmin, userController.bulkCreateUsers);

// Rutas de usuario normal
router.get('/me', authMiddleware, userController.getMe);
router.put('/profile', authMiddleware, validateProfileUpdate, userController.updateProfile);

module.exports = router;