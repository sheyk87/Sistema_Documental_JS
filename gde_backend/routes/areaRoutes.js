const express = require('express');
const router = express.Router();
const areaController = require('../controllers/areaController');
const authMiddleware = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');

// OWASP A01: Solo admin puede crear y eliminar áreas
router.post('/create', authMiddleware, requirePermission('admin_areas'), areaController.createArea);
router.delete('/delete/:id', authMiddleware, requirePermission('admin_areas'), areaController.deleteArea);
router.post('/bulk', authMiddleware, requirePermission('admin_areas'), areaController.bulkCreateAreas);

module.exports = router;