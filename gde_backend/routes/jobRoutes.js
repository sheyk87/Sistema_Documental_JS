// routes/jobRoutes.js
// Rutas para consultar estado de trabajos BullMQ
const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const authMiddleware = require('../middlewares/authMiddleware');

// OWASP A01: Solo usuarios autenticados pueden consultar estado de jobs
router.get('/:queueName/:jobId', authMiddleware, jobController.getJobStatus);

module.exports = router;
