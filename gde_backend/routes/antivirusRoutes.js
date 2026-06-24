// routes/antivirusRoutes.js
const express = require('express');
const router = express.Router();
const antivirusController = require('../controllers/antivirusController');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/stats', authMiddleware, antivirusController.getStats);
router.get('/status', authMiddleware, antivirusController.getStatus);
router.post('/update', authMiddleware, antivirusController.updateSignatures);

module.exports = router;
