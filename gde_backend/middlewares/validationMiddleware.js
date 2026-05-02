// middlewares/validationMiddleware.js
// Validación de entrada para prevenir inyección (OWASP A03, A07)
const { body, param, validationResult } = require('express-validator');

// Helper: procesa errores de validación
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Datos de entrada inválidos.', errors: errors.array().map(e => e.msg) });
    }
    next();
};

// Política de contraseñas: mínimo 8 caracteres, una mayúscula, una minúscula, un número
const passwordPolicy = body('password')
    .optional()
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.')
    .matches(/[A-Z]/).withMessage('La contraseña debe contener al menos una letra mayúscula.')
    .matches(/[a-z]/).withMessage('La contraseña debe contener al menos una letra minúscula.')
    .matches(/[0-9]/).withMessage('La contraseña debe contener al menos un número.');

// Validaciones para login
const validateLogin = [
    body('email').trim().notEmpty().withMessage('El email es requerido.').isEmail().withMessage('Formato de email inválido.').normalizeEmail(),
    body('password').trim().notEmpty().withMessage('La contraseña es requerida.'),
    handleValidationErrors
];

// Validaciones para creación de usuario
const validateCreateUser = [
    body('name').trim().notEmpty().withMessage('El nombre es requerido.')
        .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres.')
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.'-]+$/).withMessage('El nombre contiene caracteres no permitidos.'),
    body('email').trim().notEmpty().withMessage('El email es requerido.').isEmail().withMessage('Formato de email inválido.').normalizeEmail(),
    body('password').trim().notEmpty().withMessage('La contraseña es requerida.')
        .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.')
        .matches(/[A-Z]/).withMessage('Debe contener al menos una mayúscula.')
        .matches(/[a-z]/).withMessage('Debe contener al menos una minúscula.')
        .matches(/[0-9]/).withMessage('Debe contener al menos un número.'),
    body('areaId').trim().notEmpty().withMessage('El área es requerida.'),
    body('role').optional().isIn(['admin', 'user']).withMessage('Rol inválido.'),
    handleValidationErrors
];

// Validaciones para actualización de usuario
const validateUpdateUser = [
    param('id').trim().notEmpty().withMessage('ID de usuario requerido.'),
    body('name').trim().notEmpty().withMessage('El nombre es requerido.')
        .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres.'),
    body('email').trim().notEmpty().withMessage('El email es requerido.').isEmail().withMessage('Formato de email inválido.').normalizeEmail(),
    body('password').optional({ checkFalsy: true })
        .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.')
        .matches(/[A-Z]/).withMessage('Debe contener al menos una mayúscula.')
        .matches(/[a-z]/).withMessage('Debe contener al menos una minúscula.')
        .matches(/[0-9]/).withMessage('Debe contener al menos un número.'),
    body('role').optional().isIn(['admin', 'user']).withMessage('Rol inválido.'),
    handleValidationErrors
];

// Validaciones para forgot-password
const validateForgotPassword = [
    body('email').trim().notEmpty().withMessage('El email es requerido.').isEmail().withMessage('Formato de email inválido.').normalizeEmail(),
    handleValidationErrors
];

// Validaciones para reset-password
const validateResetPassword = [
    body('email').trim().notEmpty().withMessage('El email es requerido.').isEmail().withMessage('Formato inválido.').normalizeEmail(),
    body('code').trim().notEmpty().withMessage('El código es requerido.').isLength({ min: 8, max: 8 }).withMessage('Código inválido.'),
    body('newPassword').trim().notEmpty().withMessage('La nueva contraseña es requerida.')
        .isLength({ min: 8 }).withMessage('Mínimo 8 caracteres.')
        .matches(/[A-Z]/).withMessage('Debe contener una mayúscula.')
        .matches(/[a-z]/).withMessage('Debe contener una minúscula.')
        .matches(/[0-9]/).withMessage('Debe contener un número.'),
    handleValidationErrors
];

// Validaciones para 2FA
const validate2FACode = [
    body('code').trim().notEmpty().withMessage('El código 2FA es requerido.')
        .isLength({ min: 6, max: 8 }).withMessage('Código 2FA inválido.')
        .isAlphanumeric().withMessage('El código solo puede contener letras y números.'),
    handleValidationErrors
];

// Validación de ID en params
const validateParamId = [
    param('id').trim().notEmpty().withMessage('ID requerido.'),
    handleValidationErrors
];

// Validación para filename seguro (anti path traversal)
const validateFilename = [
    param('filename').trim().notEmpty().withMessage('Nombre de archivo requerido.')
        .custom((value) => {
            // Prevenir path traversal
            if (value.includes('..') || value.includes('/') || value.includes('\\')) {
                throw new Error('Nombre de archivo contiene caracteres no permitidos.');
            }
            return true;
        }),
    handleValidationErrors
];

// Validación para profile update
const validateProfileUpdate = [
    body('email').trim().notEmpty().withMessage('El email es requerido.').isEmail().withMessage('Formato de email inválido.').normalizeEmail(),
    body('newPassword').optional({ checkFalsy: true })
        .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.')
        .matches(/[A-Z]/).withMessage('Debe contener una mayúscula.')
        .matches(/[a-z]/).withMessage('Debe contener una minúscula.')
        .matches(/[0-9]/).withMessage('Debe contener un número.'),
    handleValidationErrors
];

module.exports = {
    handleValidationErrors,
    passwordPolicy,
    validateLogin,
    validateCreateUser,
    validateUpdateUser,
    validateForgotPassword,
    validateResetPassword,
    validate2FACode,
    validateParamId,
    validateFilename,
    validateProfileUpdate
};
