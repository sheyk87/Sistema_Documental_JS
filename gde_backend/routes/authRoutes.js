// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Cuando alguien haga POST a /login, ejecuta la función del controlador
router.post('/login', authController.login);

router.post('/forgot-password', authController.forgotPassword);
router.post('/validate-reset-code', authController.validateResetCode);
router.post('/reset-password', authController.resetPassword);   

module.exports = router;