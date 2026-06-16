// routes/expRoutes.js
const express = require('express');
const router = express.Router();
const expController = require('../controllers/expController');
const authMiddleware = require('../middlewares/authMiddleware');
const { checkExpedienteAccess } = require('../middlewares/roleMiddleware');

router.post('/create', authMiddleware, expController.createExpediente);
router.get('/all', authMiddleware, expController.getAllExpedientes);
router.put('/update/:id', authMiddleware, checkExpedienteAccess('write'), expController.updateExpediente);
router.post('/:id/pase', authMiddleware, checkExpedienteAccess('pase'), expController.makePase);
router.get('/:id/download-check', authMiddleware, checkExpedienteAccess('download'), (req, res) => res.json({ ok: true }));

module.exports = router;