const express = require('express');
const router = express.Router();
const docController = require('../controllers/docController');
const authMiddleware = require('../middlewares/authMiddleware');
const { validateFilename, validateParamId } = require('../middlewares/validationMiddleware');
const { publicLimiter } = require('../middlewares/rateLimiter');
const multer = require('multer');
const path = require('path');

// OWASP A08: Whitelist de tipos de archivo permitidos
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-rar-compressed'
];

const BLOCKED_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
    '.js', '.vbs', '.wsf', '.ps1', '.sh', '.php', '.py',
    '.dll', '.sys', '.drv', '.cpl'
];

// Configuración de Multer para guardar archivos con filtro de seguridad
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        // OWASP A03: Evitamos nombres duplicados y sanitizamos el nombre original
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, Date.now() + '-' + safeName);
    }
});

// Configuración de Multer para archivos temporales (se borran tras encriptar)
const uploadTemp = multer({ dest: 'uploads/temp_sealing/' });

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10MB
    fileFilter: (req, file, cb) => {
        // OWASP A08: Verificar tipo MIME
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return cb(new Error('Tipo de archivo no permitido.'), false);
        }
        // Verificar extensión
        const ext = path.extname(file.originalname).toLowerCase();
        if (BLOCKED_EXTENSIONS.includes(ext)) {
            return cb(new Error('Extensión de archivo bloqueada.'), false);
        }
        cb(null, true);
    }
});

// NUEVA: Ruta para inyectar adjuntos dentro del PDF
router.post('/embed-attachments/:id', authMiddleware, uploadTemp.single('pdf'), docController.embedAttachments);

router.post('/sign-final/:id', authMiddleware, uploadTemp.single('pdf'), docController.signFinalAndSeal);

// Configuración para mantener el archivo en memoria sin guardarlo en disco
const uploadMemory = multer({ storage: multer.memoryStorage() });

// OWASP A04: Rate limiting en ruta pública
router.get('/public/verify/:id', publicLimiter, docController.verifyPublicDoc);

// Descarga el PDF estático desencriptándolo al vuelo
router.get('/download-static/:id', authMiddleware, docController.downloadStaticPdf);

router.post('/create', authMiddleware, docController.createDocument);
router.get('/all', authMiddleware, docController.getAllDocuments);
router.put('/update/:id', authMiddleware, docController.updateDocument);
router.put('/:id/read', authMiddleware, docController.markAsRead);

// RUTAS PARA ADJUNTOS con validación de filename
router.post('/:id/attach', authMiddleware, upload.single('file'), docController.uploadAttachment);
router.delete('/:id/attach/:filename', authMiddleware, validateFilename, docController.deleteAttachment);

// RUTA PARA ELIMINAR EL DOCUMENTO COMPLETO
router.delete('/delete/:id', authMiddleware, docController.deleteDocument);

// RUTA PARA DESCARGA PROTEGIDA con validación de filename
router.get('/download/:filename', authMiddleware, validateFilename, docController.downloadAttachment);

// RUTA PARA FIRMA:
router.post('/cryptosign', authMiddleware, uploadMemory.single('pdf'), docController.cryptographicSign);

module.exports = router;