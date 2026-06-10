const express = require('express');
const router = express.Router();
const docTypeController = require('../controllers/docTypeController');
const authMiddleware = require('../middlewares/authMiddleware');
const { requireAdmin } = require('../middlewares/roleMiddleware');

// OWASP A01: Proteger mutaciones con requireAdmin. Listar disponible para usuarios autenticados.
router.get('/', authMiddleware, docTypeController.getDocTypes);
router.post('/create', authMiddleware, requireAdmin, docTypeController.createDocType);
router.put('/update/:code', authMiddleware, requireAdmin, docTypeController.updateDocType);
router.delete('/delete/:code', authMiddleware, requireAdmin, docTypeController.deleteDocType);

module.exports = router;
