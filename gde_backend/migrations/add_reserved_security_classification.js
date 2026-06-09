// migrations/add_reserved_security_classification.js
// Script de migración idempotente para dar soporte a clasificación de seguridad de documentos y 2FA en firmas.

const pool = require('../config/db');

async function runMigration() {
    console.log('🏁 Iniciando migración de base de datos para Clasificación de Seguridad y 2FA...');

    try {
        // Desactivar temporalmente validación de claves foráneas
        await pool.query('SET FOREIGN_KEY_CHECKS = 0');

        // 1. Verificar y agregar columnas en la tabla "documents"
        console.log('🔄 Verificando columnas de clasificación en la tabla "documents"...');
        const [docCols] = await pool.query('SHOW COLUMNS FROM documents');
        const docColNames = docCols.map(c => c.Field);

        if (!docColNames.includes('is_public')) {
            await pool.query('ALTER TABLE documents ADD COLUMN is_public BOOLEAN DEFAULT TRUE');
            console.log('  ✅ Columna "is_public" añadida a la tabla "documents".');
        } else {
            console.log('  ℹ️ Columna "is_public" ya existe.');
        }

        if (!docColNames.includes('auth_areas')) {
            await pool.query('ALTER TABLE documents ADD COLUMN auth_areas JSON NULL');
            console.log('  ✅ Columna "auth_areas" añadida a la tabla "documents".');
        } else {
            console.log('  ℹ️ Columna "auth_areas" ya existe.');
        }

        if (!docColNames.includes('auth_users')) {
            await pool.query('ALTER TABLE documents ADD COLUMN auth_users JSON NULL');
            console.log('  ✅ Columna "auth_users" añadida a la tabla "documents".');
        } else {
            console.log('  ℹ️ Columna "auth_users" ya existe.');
        }

        // 2. Insertar nuevos permisos
        console.log('📥 Insertando nuevos permisos en la tabla "permissions"...');
        await pool.query(`
            INSERT IGNORE INTO permissions (id, name, description) VALUES 
            ('doc_create_reserved', 'Crear Documentación Reservada', 'Crear Documentación Reservada: Permite iniciar documentación y expedientes en carácter de reservado.'),
            ('doc_sign_reserved', 'Firmar Documentación Reservada', 'Firmar Documentación Reservada: Permite firmar documentos de carácter reservado, requiriendo validación 2FA.')
        `);
        console.log('  ✅ Nuevos permisos registrados.');

        // 3. Vincular nuevos permisos a roles
        console.log('📥 Enlazando nuevos permisos con roles en "role_permissions"...');
        
        // Rol Administrador Técnico (admin) recibe todos los permisos
        await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['admin', 'doc_create_reserved']);
        await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['admin', 'doc_sign_reserved']);

        // Rol Usuario Estándar (user) recibe ambos permisos
        await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['user', 'doc_create_reserved']);
        await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['user', 'doc_sign_reserved']);

        // Rol Firmante Oficial (firmante) recibe permiso de firma reservada
        await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['firmante', 'doc_sign_reserved']);

        console.log('  ✅ Enlace de permisos y roles completado.');

        // Reactivar validación de claves foráneas
        await pool.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('🎉 🎉 Migración para Clasificación de Seguridad y 2FA completada con éxito.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error catastrófico en la migración de base de datos:', error);
        process.exit(1);
    }
}

runMigration();
