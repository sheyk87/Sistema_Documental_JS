const express = require('express');
const router = express.Router();
const docController = require('../controllers/docController');
const authMiddleware = require('../middlewares/authMiddleware');
const { checkDocumentAccess } = require('../middlewares/roleMiddleware');
const { validateFilename, validateParamId } = require('../middlewares/validationMiddleware');
const { publicLimiter } = require('../middlewares/rateLimiter');
const multer = require('multer');
const path = require('path');

// OWASP A08: Whitelist de tipos de archivo y extensiones permitidos
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-rar-compressed'
];

const ALLOWED_EXTENSIONS = [
    '.pdf',
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.csv',
    '.zip', '.rar'
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
        const ext = path.extname(file.originalname).toLowerCase();
        
        console.log(`[Multer fileFilter] Subiendo archivo: originalname="${file.originalname}", mimetype="${file.mimetype}", ext="${ext}"`);
        
        // 1. Verificar si la extensión está permitida (Lista blanca)
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            console.warn(`[Multer fileFilter] Extensión no permitida: "${ext}" para el archivo "${file.originalname}"`);
            return cb(new Error('Extensión de archivo no permitida.'), false);
        }

        // 2. Verificar si la extensión está explícitamente bloqueada (Lista negra)
        if (BLOCKED_EXTENSIONS.includes(ext)) {
            console.warn(`[Multer fileFilter] Extensión bloqueada: "${ext}" para el archivo "${file.originalname}"`);
            return cb(new Error('Extensión de archivo bloqueada.'), false);
        }
        
        // 3. Verificar tipo MIME
        const mimePermitido = ALLOWED_MIME_TYPES.includes(file.mimetype);
        
        // 4. Fallback seguro para streams genéricos, formatos de MS Office, WPS Office y comprimidos en Linux/Chrome
        const isGenericOrDocStream = 
            !file.mimetype || 
            file.mimetype === 'application/octet-stream' || 
            file.mimetype === 'application/x-zip-compressed' || 
            file.mimetype === 'binary/octet-stream' ||
            file.mimetype === 'application/vnd.ms-office' ||
            file.mimetype === 'application/x-ms-office' ||
            file.mimetype === 'application/x-ole-storage' ||
            file.mimetype === 'application/cdfv2' ||
            file.mimetype === 'application/x-cdf' ||
            file.mimetype === 'application/zip' ||
            file.mimetype === 'application/x-zip' ||
            file.mimetype === 'application/rar' ||
            file.mimetype === 'application/x-rar' ||
            (file.mimetype && (
                file.mimetype.startsWith('application/vnd.openxmlformats-officedocument') ||
                file.mimetype.startsWith('application/vnd.ms-') ||
                file.mimetype.startsWith('application/wps-office')
            ));

        if (!mimePermitido && !isGenericOrDocStream) {
            console.warn(`[Multer fileFilter] Tipo MIME no permitido: "${file.mimetype}" para extensión "${ext}" en el archivo "${file.originalname}"`);
            return cb(new Error('Tipo de archivo no permitido para esta extensión.'), false);
        }
        cb(null, true);
    }
});

// NUEVA: Ruta para inyectar adjuntos dentro del PDF
router.post('/embed-attachments/:id', authMiddleware, checkDocumentAccess('sign'), uploadTemp.single('pdf'), docController.embedAttachments);

router.post('/sign-final/:id', authMiddleware, checkDocumentAccess('sign'), uploadTemp.single('pdf'), docController.signFinalAndSeal);

// Configuración para mantener el archivo en memoria sin guardarlo en disco
const uploadMemory = multer({ storage: multer.memoryStorage() });

// OWASP A04: Rate limiting en ruta pública
router.get('/public/verify/:id', publicLimiter, docController.verifyPublicDoc);

// Descarga el PDF estático desencriptándolo al vuelo
router.get('/download-static/:id', authMiddleware, checkDocumentAccess('read'), docController.downloadStaticPdf);

router.post('/create', authMiddleware, docController.createDocument);
router.get('/all', authMiddleware, docController.getAllDocuments);
router.get('/:id', authMiddleware, checkDocumentAccess('read'), docController.getDocument);
router.get('/:id/content', authMiddleware, checkDocumentAccess('read'), docController.getDocumentContent);
router.put('/update/:id', authMiddleware, checkDocumentAccess('write'), docController.updateDocument);
router.post('/assign-number/:id', authMiddleware, checkDocumentAccess('write'), docController.assignDocumentNumber);
router.put('/:id/read', authMiddleware, checkDocumentAccess('read'), docController.markAsRead);

// RUTAS PARA ADJUNTOS con validación de filename
router.post('/:id/attach', authMiddleware, checkDocumentAccess('attach'), (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            let message = err.message || 'Error al subir el archivo.';
            if (err.code === 'LIMIT_FILE_SIZE') {
                message = 'El archivo excede el tamaño máximo permitido de 10 MB.';
            }
            return res.status(400).json({ message });
        }
        next();
    });
}, docController.uploadAttachment);
router.delete('/:id/attach/:filename', authMiddleware, checkDocumentAccess('attach'), validateFilename, docController.deleteAttachment);

// RUTA PARA ELIMINAR EL DOCUMENTO COMPLETO
router.delete('/delete/:id', authMiddleware, checkDocumentAccess('delete'), docController.deleteDocument);

// RUTA PARA DESCARGA PROTEGIDA con validación de filename
// Nota: La descarga directa usa el filename encriptado. Por seguridad el controlador docController.downloadAttachment validará la pertenencia del archivo.
router.get('/download/:filename', authMiddleware, validateFilename, docController.downloadAttachment);

// RUTA PARA FIRMA:
router.post('/cryptosign', authMiddleware, uploadMemory.single('pdf'), docController.cryptographicSign);

module.exports = router;