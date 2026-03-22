// routes/expRoutes.js
const express = require('express');
const router = express.Router();
const expController = require('../controllers/expController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/create', authMiddleware, expController.createExpediente);
router.get('/all', authMiddleware, expController.getAllExpedientes);
router.put('/update/:id', authMiddleware, expController.updateExpediente);

module.exports = router;