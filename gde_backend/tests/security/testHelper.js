// tests/security/testHelper.js
// Helper compartido para tests de seguridad OWASP

// Interceptar dotenv.config para evitar que la carga dinámica en caliente de .env sobreescriba NODE_ENV
const dotenv = require('dotenv');
const originalConfig = dotenv.config;
dotenv.config = function(options) {
    const res = originalConfig.apply(this, arguments);
    process.env.NODE_ENV = 'test';
    return res;
};

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Cargar variables de entorno para tests
dotenv.config();

// Importar app sin iniciar el servidor
const app = require('../../server');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_OPTIONS = { issuer: 'gde-system', audience: 'gde-api' };

/**
 * Genera un token JWT válido para un usuario simulado
 */
function generateTestToken(payload = { id: 'u_test', role: 'user' }, expiresIn = '1h') {
    return jwt.sign(payload, JWT_SECRET, { expiresIn, ...JWT_OPTIONS });
}

/**
 * Genera un token admin para tests
 */
function generateAdminToken() {
    return generateTestToken({ id: 'u1', role: 'admin' });
}

/**
 * Genera un token normal (no admin) para tests
 */
function generateUserToken() {
    return generateTestToken({ id: 'u2', role: 'user' });
}

/**
 * Genera un token expirado
 */
function generateExpiredToken() {
    return jwt.sign({ id: 'u_test', role: 'user' }, JWT_SECRET, { expiresIn: '-1s', ...JWT_OPTIONS });
}

/**
 * Genera un token con secret incorrecto
 */
function generateInvalidToken() {
    return jwt.sign({ id: 'u_test', role: 'user' }, 'wrong_secret_key_12345', { expiresIn: '1h', ...JWT_OPTIONS });
}

module.exports = {
    app,
    request,
    generateTestToken,
    generateAdminToken,
    generateUserToken,
    generateExpiredToken,
    generateInvalidToken,
    JWT_SECRET,
    JWT_OPTIONS
};
