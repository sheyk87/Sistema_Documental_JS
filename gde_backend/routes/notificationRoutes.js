const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/create', authMiddleware, notificationController.createNotification);
router.get('/mine', authMiddleware, notificationController.getMyNotifications);
router.put('/:id/read', authMiddleware, notificationController.markAsRead);
router.put('/read-all', authMiddleware, notificationController.markAllRead);
router.delete('/delete-all', authMiddleware, notificationController.deleteAllMyNotifications);

module.exports = router;