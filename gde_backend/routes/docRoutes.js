// routes/docRoutes.js
const express = require('express');
const router = express.Router();
const docController = require('../controllers/docController');
const authMiddleware = require('../middlewares/authMiddleware');

// Ambas rutas estarán protegidas por el guardia de seguridad
router.post('/create', authMiddleware, docController.createDocument);
router.get('/all', authMiddleware, docController.getAllDocuments);
router.put('/update/:id', authMiddleware, docController.updateDocument);

module.exports = router;