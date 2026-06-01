// setup_full.js
// Script de inicialización universal para construir la base de datos completa desde cero.
// Consolida todos los cambios de base de datos de las Fases 1 y 2, incluyendo índices de optimización y RBAC.

const pool = require('./config/db');
const bcrypt = require('bcrypt');

async function setupFull() {
    try {
        console.log('🏁 Iniciando construcción de base de datos desde cero...');

        // 1. Crear tabla areas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS areas (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "areas" creada.');

        // 2. Crear tabla users con campos de licencia, estado y delegación
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                area_id VARCHAR(50) NOT NULL,
                areas JSON,
                role ENUM('admin', 'user') DEFAULT 'user',
                web_notifications BOOLEAN DEFAULT TRUE,
                email_notifications BOOLEAN DEFAULT TRUE,
                reset_code VARCHAR(8) DEFAULT NULL, 
                reset_expires DATETIME DEFAULT NULL,
                two_factor_secret VARCHAR(255) DEFAULT NULL,
                two_factor_enabled BOOLEAN DEFAULT FALSE,
                two_factor_recovery_codes JSON DEFAULT NULL,
                status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
                superior_id VARCHAR(50) DEFAULT NULL,
                delegated_to VARCHAR(50) DEFAULT NULL,
                licence_start DATETIME DEFAULT NULL,
                licence_end DATETIME DEFAULT NULL,
                FOREIGN KEY (area_id) REFERENCES areas(id),
                CONSTRAINT fk_users_superior FOREIGN KEY (superior_id) REFERENCES users(id) ON DELETE SET NULL,
                CONSTRAINT fk_users_delegated FOREIGN KEY (delegated_to) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "users" creada.');

        // 3. Crear tablas de Roles y Permisos (RBAC)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "roles" creada.');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS permissions (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "permissions" creada.');

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

        // 4. Crear tabla documents
        await pool.query(`
            CREATE TABLE IF NOT EXISTS documents (
                id VARCHAR(50) PRIMARY KEY,
                number VARCHAR(50) DEFAULT NULL,
                doc_type VARCHAR(50) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                creator_id VARCHAR(50) NOT NULL,
                current_owner_id VARCHAR(50) NOT NULL,
                area_id VARCHAR(50) DEFAULT NULL,
                status VARCHAR(50) NOT NULL,
                owners JSON,
                recipients JSON,
                read_by VARCHAR(2000) DEFAULT '[]',
                signed_by JSON,
                signatories JSON,
                attachments JSON,
                related_docs JSON,
                pdf_hash VARCHAR(64) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (creator_id) REFERENCES users(id),
                FOREIGN KEY (area_id) REFERENCES areas(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "documents" creada.');

        // 5. Crear tabla expedientes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS expedientes (
                id VARCHAR(50) PRIMARY KEY,
                number VARCHAR(50) UNIQUE NOT NULL,
                subject VARCHAR(255) NOT NULL,
                creator_id VARCHAR(50) NOT NULL,
                area_id VARCHAR(50) DEFAULT NULL,
                current_owner_id VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL,
                is_public BOOLEAN DEFAULT TRUE,
                auth_areas JSON,
                auth_users JSON,
                linked_docs JSON,
                sealed_docs JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (creator_id) REFERENCES users(id),
                FOREIGN KEY (area_id) REFERENCES areas(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "expedientes" creada.');

        // 6. Crear tabla expediente_movements (pases inmutables)
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

        // 9. Crear tabla numbering_sequences
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

        // 10. Crear tabla history
        await pool.query(`
            CREATE TABLE IF NOT EXISTS history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                item_id VARCHAR(50) NOT NULL,
                item_type ENUM('documento', 'expediente') NOT NULL,
                user_id VARCHAR(50) NOT NULL,
                action VARCHAR(100) NOT NULL,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "history" creada.');

        // 11. Crear tabla notifications
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                sender_id VARCHAR(50) NOT NULL,
                item_id VARCHAR(50) NOT NULL,
                item_type ENUM('documento', 'expediente') NOT NULL,
                action VARCHAR(100) NOT NULL,
                message VARCHAR(255) NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (sender_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "notifications" creada.');

        // 12. Cargar datos maestros iniciales (Areas y Usuarios)
        console.log('📥 Cargando datos maestros iniciales...');
        await pool.query(`
            INSERT IGNORE INTO areas (id, name) VALUES 
            ('a1', 'Dirección General'), 
            ('a2', 'Recursos Humanos'), 
            ('a3', 'Sistemas')
        `);

        const hash = await bcrypt.hash('123', 10);
        await pool.query(`
            INSERT IGNORE INTO users (id, name, email, password, area_id, role) VALUES 
            ('u1', 'Admin Sistema', 'admin@gde.com', '${hash}', 'a3', 'admin'),
            ('u2', 'Juan Perez', 'juan@gde.com', '${hash}', 'a1', 'user'),
            ('u3', 'Maria Gomez', 'maria@gde.com', '${hash}', 'a2', 'user'),
            ('u4', 'Carlos Lopez', 'carlos@gde.com', '${hash}', 'a3', 'user')
        `);

        // 13. Cargar Roles, Permisos y Mapeos
        console.log('📥 Cargando configuración de seguridad RBAC...');
        await pool.query(`
            INSERT IGNORE INTO roles (id, name) VALUES 
            ('admin', 'Administrador Técnico'),
            ('user', 'Usuario Estándar'),
            ('redactor', 'Redactor de Documentos'),
            ('revisor', 'Revisor de Trámites'),
            ('firmante', 'Firmante Oficial'),
            ('auditor', 'Auditor Gubernamental')
        `);

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

        // Vincular todos los permisos al administrador
        const [allPerms] = await pool.query('SELECT id FROM permissions');
        for (let perm of allPerms) {
            await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['admin', perm.id]);
        }

        // Vincular permisos estándar al usuario básico
        const userPerms = ['doc_create', 'doc_read', 'doc_edit', 'doc_delete', 'doc_sign', 'exp_create', 'exp_read', 'exp_write', 'exp_pase'];
        for (let permId of userPerms) {
            await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['user', permId]);
        }

        // Mapear usuarios existentes a sus nuevos roles
        await pool.query("INSERT IGNORE INTO user_roles (user_id, role_id) VALUES ('u1', 'admin')");
        await pool.query("INSERT IGNORE INTO user_roles (user_id, role_id) VALUES ('u2', 'user')");
        await pool.query("INSERT IGNORE INTO user_roles (user_id, role_id) VALUES ('u3', 'user')");
        await pool.query("INSERT IGNORE INTO user_roles (user_id, role_id) VALUES ('u4', 'user')");

        // 14. Cargar tipos de documentos iniciales
        console.log('📥 Cargando tipos de documentos...');
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

        // 15. Crear índices de optimización para base de datos
        console.log('🔧 Agregando índices de rendimiento de base de datos...');
        const indexes = [
            { name: 'idx_history_item', sql: 'CREATE INDEX idx_history_item ON history (item_id, item_type)' },
            { name: 'idx_history_created', sql: 'CREATE INDEX idx_history_created ON history (created_at)' },
            { name: 'idx_history_action_type_created', sql: 'CREATE INDEX idx_history_action_type_created ON history (item_type, action, created_at)' },
            { name: 'idx_history_user', sql: 'CREATE INDEX idx_history_user ON history (user_id)' },
            { name: 'idx_docs_status', sql: 'CREATE INDEX idx_docs_status ON documents (status)' },
            { name: 'idx_docs_creator', sql: 'CREATE INDEX idx_docs_creator ON documents (creator_id)' },
            { name: 'idx_docs_owner', sql: 'CREATE INDEX idx_docs_owner ON documents (current_owner_id)' },
            { name: 'idx_docs_area', sql: 'CREATE INDEX idx_docs_area ON documents (area_id)' },
            { name: 'idx_docs_created', sql: 'CREATE INDEX idx_docs_created ON documents (created_at)' },
            { name: 'idx_notif_user_read', sql: 'CREATE INDEX idx_notif_user_read ON notifications (user_id, is_read)' },
            { name: 'idx_notif_created', sql: 'CREATE INDEX idx_notif_created ON notifications (created_at)' },
            { name: 'idx_exp_status', sql: 'CREATE INDEX idx_exp_status ON expedientes (status)' },
            { name: 'idx_exp_owner', sql: 'CREATE INDEX idx_exp_owner ON expedientes (current_owner_id)' },
            { name: 'idx_exp_creator', sql: 'CREATE INDEX idx_exp_creator ON expedientes (creator_id)' },
            { name: 'idx_users_area', sql: 'CREATE INDEX idx_users_area ON users (area_id)' }
        ];

        for (const idx of indexes) {
            try {
                await pool.query(idx.sql);
                console.log(`  ✅ Índice ${idx.name} creado.`);
            } catch (err) {
                if (err.code === 'ER_DUP_KEYNAME') {
                    // Ignorar si ya existe
                } else {
                    console.error(`  ❌ Error creando índice ${idx.name}:`, err.message);
                }
            }
        }

        console.log('🎉 🎉 Base de datos construida completamente con éxito y optimizada para producción.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error catastrófico inicializando base de datos:', error);
        process.exit(1);
    }
}

setupFull();
