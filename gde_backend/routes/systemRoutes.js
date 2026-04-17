// routes/systemRoutes.js
const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');
const authMiddleware = require('../middlewares/authMiddleware'); // Importamos al guardia

// Esta ruta está PROTEGIDA por el authMiddleware
router.get('/init', authMiddleware, systemController.getInitialData);
router.get('/settings', authMiddleware, systemController.getSettings);
router.put('/settings', authMiddleware, systemController.updateSettings);

module.exports = router;