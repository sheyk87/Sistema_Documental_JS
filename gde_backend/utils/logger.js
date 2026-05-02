// utils/logger.js
// Logger estructurado de seguridad con Winston (OWASP A09)
const winston = require('winston');
const path = require('path');

const logDir = path.join(__dirname, '../logs');

// Formato personalizado para logs de seguridad
const securityFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: false }), // No incluir stack traces en logs
    winston.format.json()
);

// Logger principal de seguridad
const securityLogger = winston.createLogger({
    level: 'info',
    format: securityFormat,
    defaultMeta: { service: 'gde-security' },
    transports: [
        // Archivo de eventos de seguridad
        new winston.transports.File({
            filename: path.join(logDir, 'security.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 10,
            level: 'info'
        }),
        // Archivo de errores
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            maxsize: 5242880,
            maxFiles: 5,
            level: 'error'
        })
    ]
});

// En desarrollo, también mostrar en consola
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    securityLogger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

/**
 * Registra un evento de autenticación (login exitoso/fallido)
 */
function logAuthEvent(eventType, details = {}) {
    // Nunca logueamos passwords
    const safeDetails = { ...details };
    delete safeDetails.password;
    delete safeDetails.newPassword;
    delete safeDetails.secret;

    securityLogger.info({
        category: 'AUTH',
        event: eventType,
        ...safeDetails
    });
}

/**
 * Registra un intento de acceso denegado
 */
function logAccessDenied(details = {}) {
    securityLogger.warn({
        category: 'ACCESS_DENIED',
        ...details
    });
}

/**
 * Registra una acción administrativa
 */
function logAdminAction(action, details = {}) {
    const safeDetails = { ...details };
    delete safeDetails.password;

    securityLogger.info({
        category: 'ADMIN',
        action,
        ...safeDetails
    });
}

/**
 * Registra un error de seguridad
 */
function logSecurityError(error, context = {}) {
    securityLogger.error({
        category: 'SECURITY_ERROR',
        message: error.message || 'Error desconocido',
        ...context
    });
}

/**
 * Registra evento de modificación de datos sensibles
 */
function logDataModification(action, details = {}) {
    const safeDetails = { ...details };
    delete safeDetails.password;
    delete safeDetails.secret;

    securityLogger.info({
        category: 'DATA_MODIFICATION',
        action,
        ...safeDetails
    });
}

module.exports = {
    securityLogger,
    logAuthEvent,
    logAccessDenied,
    logAdminAction,
    logSecurityError,
    logDataModification
};
