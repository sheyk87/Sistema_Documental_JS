const express = require('express');
const router = express.Router();
const docTypeController = require('../controllers/docTypeController');
const authMiddleware = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');

// OWASP A01: Proteger mutaciones con requirePermission. Listar disponible para usuarios autenticados.
router.get('/', authMiddleware, docTypeController.getDocTypes);
router.post('/create', authMiddleware, requirePermission('admin_manage_doc_types'), docTypeController.createDocType);
router.put('/update/:code', authMiddleware, requirePermission('admin_manage_doc_types'), docTypeController.updateDocType);
router.delete('/delete/:code', authMiddleware, requirePermission('admin_manage_doc_types'), docTypeController.deleteDocType);

module.exports = router;
