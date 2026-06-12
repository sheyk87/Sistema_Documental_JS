// migrations/migrate_rbac_and_sequences.js
// Script transaccional para actualizar el esquema de base de datos MySQL

const pool = require('../config/db');

async function runMigration() {
    console.log('🏁 Iniciando migración de base de datos...');

    try {
        // 1. Crear tabla roles
        await pool.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "roles" creada.');

        // 2. Crear tabla permissions
        await pool.query(`
            CREATE TABLE IF NOT EXISTS permissions (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "permissions" creada.');

        // 3. Crear tabla asociativa role_permissions
        await pool.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id VARCHAR(50) NOT NULL,
                permission_id VARCHAR(50) NOT NULL,
                PRIMARY KEY (role_id, permission_id),
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "role_permissions" creada.');

        // 4. Crear tabla asociativa user_roles
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_roles (
                user_id VARCHAR(50) NOT NULL,
                role_id VARCHAR(50) NOT NULL,
                PRIMARY KEY (user_id, role_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "user_roles" creada.');

        // 5. Crear tabla numbering_sequences
        await pool.query(`
            CREATE TABLE IF NOT EXISTS numbering_sequences (
                id INT AUTO_INCREMENT PRIMARY KEY,
                doc_type VARCHAR(50) NOT NULL,
                year INT NOT NULL,
                \`last_value\` INT NOT NULL DEFAULT 0,
                UNIQUE KEY uq_type_year (doc_type, year)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "numbering_sequences" creada.');

        // 6. Crear tabla expediente_movements
        await pool.query(`
            CREATE TABLE IF NOT EXISTS expediente_movements (
                id VARCHAR(50) PRIMARY KEY,
                expediente_id VARCHAR(50) NOT NULL,
                sender_id VARCHAR(50) NOT NULL,
                sender_area_id VARCHAR(50) NOT NULL,
                receiver_id VARCHAR(50) NOT NULL,
                receiver_area_id VARCHAR(50) NOT NULL,
                notes TEXT,
                linked_docs_snapshot JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (expediente_id) REFERENCES expedientes(id) ON DELETE CASCADE,
                FOREIGN KEY (sender_id) REFERENCES users(id),
                FOREIGN KEY (receiver_id) REFERENCES users(id),
                FOREIGN KEY (sender_area_id) REFERENCES areas(id),
                FOREIGN KEY (receiver_area_id) REFERENCES areas(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "expediente_movements" creada.');

        // 7. Crear tabla document_types
        await pool.query(`
            CREATE TABLE IF NOT EXISTS document_types (
                code VARCHAR(10) PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                requires_signature BOOLEAN DEFAULT TRUE,
                allows_attachments BOOLEAN DEFAULT TRUE,
                is_reserved BOOLEAN DEFAULT FALSE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "document_types" creada.');

        // 8. Crear tabla templates
        await pool.query(`
            CREATE TABLE IF NOT EXISTS templates (
                id VARCHAR(50) PRIMARY KEY,
                doc_type VARCHAR(10) NOT NULL,
                name VARCHAR(100) NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (doc_type) REFERENCES document_types(code) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "templates" creada.');

        // 9. Modificar tabla users para incorporar estados de licencia y delegación
        // Verificamos primero si las columnas ya existen para evitar errores al re-correr la migración
        const [columns] = await pool.query('SHOW COLUMNS FROM users');
        const columnNames = columns.map(c => c.Field);

        // Asegurar que la columna 'role' permita roles dinámicos (VARCHAR(50)) en lugar de ENUM
        await pool.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(50) DEFAULT 'user'");

        if (!columnNames.includes('status')) {
            await pool.query("ALTER TABLE users ADD COLUMN status ENUM('active', 'inactive', 'suspended') DEFAULT 'active'");
            console.log('✅ Columna "status" añadida a la tabla "users".');
        }
        if (!columnNames.includes('superior_id')) {
            await pool.query("ALTER TABLE users ADD COLUMN superior_id VARCHAR(50) DEFAULT NULL, ADD CONSTRAINT fk_users_superior FOREIGN KEY (superior_id) REFERENCES users(id) ON DELETE SET NULL");
            console.log('✅ Columna "superior_id" añadida a la tabla "users".');
        }
        if (!columnNames.includes('delegated_to')) {
            await pool.query("ALTER TABLE users ADD COLUMN delegated_to VARCHAR(50) DEFAULT NULL, ADD CONSTRAINT fk_users_delegated FOREIGN KEY (delegated_to) REFERENCES users(id) ON DELETE SET NULL");
            console.log('✅ Columna "delegated_to" añadida a la tabla "users".');
        }
        if (!columnNames.includes('licence_start')) {
            await pool.query("ALTER TABLE users ADD COLUMN licence_start DATETIME DEFAULT NULL");
            console.log('✅ Columna "licence_start" añadida a la tabla "users".');
        }
        if (!columnNames.includes('licence_end')) {
            await pool.query("ALTER TABLE users ADD COLUMN licence_end DATETIME DEFAULT NULL");
            console.log('✅ Columna "licence_end" añadida a la tabla "users".');
        }

        // 10. Cargar Roles Básicos
        console.log('📥 Cargando roles básicos...');
        await pool.query(`
            INSERT IGNORE INTO roles (id, name) VALUES 
            ('admin', 'Administrador Técnico'),
            ('user', 'Usuario Estándar'),
            ('redactor', 'Redactor de Documentos'),
            ('revisor', 'Revisor de Trámites'),
            ('firmante', 'Firmante Oficial'),
            ('auditor', 'Auditor Gubernamental')
        `);

        // 11. Cargar Permisos Básicos
        console.log('📥 Cargando permisos básicos...');
        await pool.query(`
            INSERT IGNORE INTO permissions (id, name) VALUES 
            ('doc_create', 'Crear Borrador de Documento'),
            ('doc_read', 'Visualizar Detalles de Documento'),
            ('doc_edit', 'Editar Borrador de Documento'),
            ('doc_delete', 'Eliminar Borrador de Documento'),
            ('doc_sign', 'Aplicar Firma a Documento'),
            ('exp_create', 'Caratular / Iniciar Expediente'),
            ('exp_read', 'Visualizar Expediente'),
            ('exp_write', 'Editar Expediente y Vincular Fojas'),
            ('exp_pase', 'Realizar Pase de Expediente'),
            ('admin_users', 'Gestionar Usuarios'),
            ('admin_areas', 'Gestionar Reparticiones / Áreas'),
            ('admin_services', 'Configurar Conectividad de Servidores'),
            ('audit_logs', 'Acceso a Logs de Auditoría')
        `);

        // 12. Asociar Permisos a los Roles
        console.log('📥 Enlazando roles y permisos...');
        
        // El administrador recibe TODOS los permisos
        const [allPerms] = await pool.query('SELECT id FROM permissions');
        for (let perm of allPerms) {
            await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['admin', perm.id]);
        }

        // El rol "user" recibe permisos estándares de operación
        const userPerms = ['doc_create', 'doc_read', 'doc_edit', 'doc_delete', 'doc_sign', 'exp_create', 'exp_read', 'exp_write', 'exp_pase'];
        for (let permId of userPerms) {
            await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['user', permId]);
        }

        // 13. Mapear roles antiguos a la tabla user_roles (Mantener retrocompatibilidad)
        console.log('📥 Mapeando usuarios existentes a sus nuevos roles...');
        const [existingUsers] = await pool.query('SELECT id, role FROM users');
        for (let u of existingUsers) {
            // Asigna el rol correspondiente
            const targetRole = u.role === 'admin' ? 'admin' : 'user';
            await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [u.id, targetRole]);
        }

        // 14. Cargar tipos documentales iniciales por defecto para compatibilidad
        console.log('📥 Cargando tipos de documentos por defecto...');
        await pool.query(`
            INSERT IGNORE INTO document_types (code, name, requires_signature, allows_attachments, is_reserved) VALUES 
            ('NO', 'Nota', 1, 1, 0),
            ('ME', 'Memo', 1, 1, 0),
            ('IF', 'Informe', 1, 1, 0),
            ('RESOL', 'Resolucion', 1, 1, 0),
            ('DISP', 'Disposicion', 1, 1, 0),
            ('ACTU', 'Actuacion', 1, 1, 0),
            ('DICT', 'Dictamen', 1, 1, 0)
        `);

        console.log('🎉 ¡Migración completada exitosamente sin pérdida de datos!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error catastrófico en la migración de base de datos:', error);
        process.exit(1);
    }
}

runMigration();
