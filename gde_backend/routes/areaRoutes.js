const express = require('express');
const router = express.Router();
const areaController = require('../controllers/areaController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/create', authMiddleware, areaController.createArea);
router.delete('/delete/:id', authMiddleware, areaController.deleteArea);
router.post('/bulk', authMiddleware, areaController.bulkCreateAreas);

module.exports = router;