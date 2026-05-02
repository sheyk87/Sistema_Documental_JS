// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const { logAccessDenied } = require('../utils/logger');

module.exports = (req, res, next) => {
    // Buscamos el token en los encabezados de la petición
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ message: 'Acceso denegado. Se requiere un token.' });
    }

    try {
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