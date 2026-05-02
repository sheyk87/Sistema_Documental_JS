// tests/security/a09-logging-monitoring.test.js
// OWASP A09: Security Logging and Monitoring Failures Tests
const fs = require('fs');
const path = require('path');

describe('OWASP A09 - Security Logging and Monitoring Failures', () => {

    test('1. Security logger module exists and exports required functions', () => {
        const logger = require('../../utils/logger');
        expect(typeof logger.logAuthEvent).toBe('function');
        expect(typeof logger.logAccessDenied).toBe('function');
        expect(typeof logger.logAdminAction).toBe('function');
        expect(typeof logger.logSecurityError).toBe('function');
        expect(typeof logger.logDataModification).toBe('function');
    });

    test('2. Auth controller uses security logging for login', () => {
        const authPath = path.join(__dirname, '../../controllers/authController.js');
        const content = fs.readFileSync(authPath, 'utf8');
        expect(content).toContain('logAuthEvent');
        expect(content).toContain('LOGIN_FAILED');
        expect(content).toContain('LOGIN_SUCCESS');
    });

    test('3. Auth controller logs password reset events', () => {
        const authPath = path.join(__dirname, '../../controllers/authController.js');
        const content = fs.readFileSync(authPath, 'utf8');
        expect(content).toContain('PASSWORD_RESET');
    });

    test('4. User controller logs admin actions (create/update/delete)', () => {
        const userPath = path.join(__dirname, '../../controllers/userController.js');
        const content = fs.readFileSync(userPath, 'utf8');
        expect(content).toContain('logAdminAction');
        expect(content).toContain('USER_CREATED');
        expect(content).toContain('USER_UPDATED');
        expect(content).toContain('USER_DELETED');
    });

    test('5. Logger does NOT log sensitive data (passwords)', () => {
        const loggerPath = path.join(__dirname, '../../utils/logger.js');
        const content = fs.readFileSync(loggerPath, 'utf8');
        // Logger should delete password from logged data
        expect(content).toContain('delete safeDetails.password');
    });

    test('6. System controller logs settings changes', () => {
        const sysPath = path.join(__dirname, '../../controllers/systemController.js');
        const content = fs.readFileSync(sysPath, 'utf8');
        expect(content).toContain('logAdminAction');
        expect(content).toContain('SETTINGS_UPDATED');
    });
});
