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

// Configuración de Multer para archivos temporales (se borran tras encriptar)
const uploadTemp = multer({ dest: 'uploads/temp_sealing/' });

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10MB
    // fileFilter: (req, file, cb) => {
    //     const allowedTypes = /jpeg|jpg|png|pdf/;
    //     const isAllowed = allowedTypes.test(file.mimetype);
    //     cb(null, isAllowed);
    // }
});

// Configuración para mantener el archivo en memoria sin guardarlo en disco
const uploadMemory = multer({ storage: multer.memoryStorage() });

router.get('/public/verify/:id', docController.verifyPublicDoc);

// === NUEVAS RUTAS DE SELLADO Y DESCARGA ESTÁTICA ===
// Recibe el PDF generado en el frontend, calcula el hash, encripta y guarda
router.post('/sign-final/:id', authMiddleware, uploadTemp.single('pdf'), docController.signFinalAndSeal);
// Descarga el PDF estático desencriptándolo al vuelo
router.get('/download-static/:id', authMiddleware, docController.downloadStaticPdf);

router.post('/create', authMiddleware, docController.createDocument);
router.get('/all', authMiddleware, docController.getAllDocuments);
router.put('/update/:id', authMiddleware, docController.updateDocument);

// NUEVAS RUTAS PARA ADJUNTOS
router.post('/:id/attach', authMiddleware, upload.single('file'), docController.uploadAttachment);
router.delete('/:id/attach/:filename', authMiddleware, docController.deleteAttachment);

// NUEVA RUTA PARA ELIMINAR EL DOCUMENTO COMPLETO
router.delete('/delete/:id', authMiddleware, docController.deleteDocument);

// NUEVA RUTA PARA DESCARGA PROTEGIDA
router.get('/download/:filename', authMiddleware, docController.downloadAttachment);

// NUEVA RUTA PARA FIRMA:
router.post('/cryptosign', authMiddleware, uploadMemory.single('pdf'), docController.cryptographicSign);

module.exports = router;