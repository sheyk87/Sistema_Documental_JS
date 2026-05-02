// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const { loginLimiter, forgotPasswordLimiter, twoFactorLimiter } = require('../middlewares/rateLimiter');
const { validateLogin, validateForgotPassword, validateResetPassword, validate2FACode } = require('../middlewares/validationMiddleware');

// OWASP A04, A07: Rate limiting en endpoints de autenticación
router.post('/login', loginLimiter, validateLogin, authController.login);

router.post('/forgot-password', forgotPasswordLimiter, validateForgotPassword, authController.forgotPassword);
router.post('/validate-reset-code', forgotPasswordLimiter, authController.validateResetCode);
router.post('/reset-password', forgotPasswordLimiter, validateResetPassword, authController.resetPassword);
router.post('/2fa/setup', authMiddleware, authController.setup2FA);
router.post('/2fa/verify', twoFactorLimiter, authMiddleware, validate2FACode, authController.verify2FA);
router.post('/2fa/regenerate-codes', authMiddleware, authController.regenerateRecoveryCodes);

module.exports = router;