const express = require('express');
const router = express.Router();
const areaController = require('../controllers/areaController');
const authMiddleware = require('../middlewares/authMiddleware');
const { requireAdmin } = require('../middlewares/roleMiddleware');

// OWASP A01: Solo admin puede crear y eliminar áreas
router.post('/create', authMiddleware, requireAdmin, areaController.createArea);
router.delete('/delete/:id', authMiddleware, requireAdmin, areaController.deleteArea);
router.post('/bulk', authMiddleware, requireAdmin, areaController.bulkCreateAreas);

module.exports = router;