// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Cuando alguien haga POST a /login, ejecuta la función del controlador
router.post('/login', authController.login);

module.exports = router;