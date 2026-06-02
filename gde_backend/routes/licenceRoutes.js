// routes/licenceRoutes.js
// Rutas de administración y autogestión de licencias / ausencias (Fase 3).
// Protegido por autenticación JWT.

const express = require('express');
const router = express.Router();
const licenceController = require('../controllers/licenceController');
const authMiddleware = require('../middlewares/authMiddleware');

// Obtener lista de usuarios elegibles para designar como delegados
router.get('/eligible-delegates', authMiddleware, licenceController.getEligibleDelegates);

// Configurar o limpiar licencia propia (Autogestión)
router.post('/configure', authMiddleware, licenceController.updateLicence);

// Configurar o limpiar licencia de cualquier usuario (Acceso reservado a Admins)
// Se enviará en el body el parámetro 'targetUserId'
router.post('/admin-configure', authMiddleware, licenceController.updateLicence);

module.exports = router;
