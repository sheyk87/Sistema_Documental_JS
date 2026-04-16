const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/create', authMiddleware, userController.createUser);
router.put('/update/:id', authMiddleware, userController.updateUser);
router.delete('/delete/:id', authMiddleware, userController.deleteUser);
router.post('/bulk', authMiddleware, userController.bulkCreateUsers);
router.get('/me', authMiddleware, userController.getMe);

module.exports = router;