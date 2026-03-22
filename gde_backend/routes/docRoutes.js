const express = require('express');
const router = express.Router();
const docController = require('../controllers/docController');
const authMiddleware = require('../middlewares/authMiddleware');
const multer = require('multer');
const path = require('path');

// Configuración de Multer para guardar archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        // Evitamos nombres duplicados agregando la fecha exacta
        cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
});
const upload = multer({ storage });

router.post('/create', authMiddleware, docController.createDocument);
router.get('/all', authMiddleware, docController.getAllDocuments);
router.put('/update/:id', authMiddleware, docController.updateDocument);

// NUEVAS RUTAS PARA ADJUNTOS
router.post('/:id/attach', authMiddleware, upload.single('file'), docController.uploadAttachment);
router.delete('/:id/attach/:filename', authMiddleware, docController.deleteAttachment);

module.exports = router;