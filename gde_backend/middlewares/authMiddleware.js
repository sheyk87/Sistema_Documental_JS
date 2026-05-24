// middlewares/authMiddleware.js
// OWASP A07: Autenticación y verificación de sesiones con blacklist JWT (Fase 3)
const jwt = require('jsonwebtoken');
const { logAccessDenied } = require('../utils/logger');
const redis = require('../config/redisClient');

module.exports = async (req, res, next) => {
    // Buscamos el token en los encabezados de la petición
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ message: 'Acceso denegado. Se requiere un token.' });
    }

    try {
        // OWASP A07: Verificar si el token fue revocado (logout)
        // Si Redis falla, permitimos pasar (degradación elegante)
        try {
            const isBlacklisted = await redis.get(`gde:bl:${token}`);
            if (isBlacklisted) {
                logAccessDenied({ reason: 'blacklisted_token', ip: req.ip, path: req.path });
                return res.status(401).json({ message: 'Token inválido o expirado.' });
            }
        } catch (redisErr) {
            // Redis caído → no podemos verificar blacklist, pero no bloqueamos al usuario
            console.error('Redis blacklist check fallback:', redisErr.message);
        }

        // Verificamos si el token es real usando nuestra palabra secreta
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: 'gde-system',
            audience: 'gde-api'
        });
        req.user = decoded; // Guardamos los datos del usuario en la request
        next(); // Le decimos al servidor: "Todo en orden, déjalo pasar a la ruta"
    } catch (error) {
        logAccessDenied({ reason: 'invalid_token', ip: req.ip, path: req.path });
        // Mensaje genérico para no revelar si el token expiró o es inválido
        res.status(401).json({ message: 'Token inválido o expirado.' });
    }
};