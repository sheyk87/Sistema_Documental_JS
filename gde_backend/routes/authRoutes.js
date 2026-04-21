// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

// Cuando alguien haga POST a /login, ejecuta la función del controlador
router.post('/login', authController.login);

router.post('/forgot-password', authController.forgotPassword);
router.post('/validate-reset-code', authController.validateResetCode);
router.post('/reset-password', authController.resetPassword);   
router.post('/2fa/setup', authMiddleware, authController.setup2FA); // Protegido por el tempToken
router.post('/2fa/verify', authMiddleware, authController.verify2FA); // Protegido por el tempToken
router.post('/2fa/regenerate-codes', authMiddleware, authController.regenerateRecoveryCodes);

module.exports = router;