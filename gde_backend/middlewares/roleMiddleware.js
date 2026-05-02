// middlewares/roleMiddleware.js
// Middleware de autorización basado en roles (OWASP A01 - Broken Access Control)

/**
 * Middleware que restringe el acceso solo a usuarios con rol 'admin'.
 * Debe usarse DESPUÉS de authMiddleware (req.user ya existe).
 */
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado. Se requieren privilegios de administrador.' });
    }
    next();
};

/**
 * Factory: Genera un middleware que exige uno de los roles indicados.
 * Ejemplo de uso: requireRole('admin', 'supervisor')
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Acceso denegado. No tiene los permisos necesarios.' });
        }
        next();
    };
};

module.exports = { requireAdmin, requireRole };
