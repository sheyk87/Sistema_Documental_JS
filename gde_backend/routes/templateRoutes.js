// routes/templateRoutes.js
// Rutas para el módulo de Gestión de Plantillas (Fase 3).
// Protegido por autenticación de JWT y control de acceso de roles (RBAC).

const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const authMiddleware = require('../middlewares/authMiddleware');
const { requireAdmin } = require('../middlewares/roleMiddleware');

// Obtener todas las plantillas (Disponible para admins y usuarios para que puedan asignarlas u observarlas)
router.get('/', authMiddleware, templateController.getTemplates);

// Obtener la plantilla asignada a un tipo de documento específico (Disponible para cualquier usuario al redactar)
router.get('/for-type/:docType', authMiddleware, templateController.getTemplateForType);

// Acciones de modificación protegidas estrictamente para administradores (OWASP A01)
router.post('/create', authMiddleware, requireAdmin, templateController.createTemplate);
router.put('/update/:id', authMiddleware, requireAdmin, templateController.updateTemplate);
router.delete('/delete/:id', authMiddleware, requireAdmin, templateController.deleteTemplate);

module.exports = router;
