// setup_full.js
// Script de inicialización universal para construir la base de datos completa desde cero.
// Consolida todos los cambios de base de datos de las Fases 1, 2 y 3, incluyendo índices de optimización, RBAC y plantillas flexibles.

const pool = require('./config/db');
const bcrypt = require('bcrypt');

async function setupFull() {
    try {
        console.log('🏁 Iniciando construcción de base de datos desde cero...');

        // Desactivar temporalmente foreign keys para recreación limpia
        await pool.query('SET FOREIGN_KEY_CHECKS = 0');

        // Dropear tablas en orden inverso para evitar colisiones
        const tablesToDrop = [
            'history',
            'notifications',
            'expediente_movements',
            'expedientes',
            'documents',
            'user_roles',
            'role_permissions',
            'permissions',
            'roles',
            'password_history',
            'users',
            'areas',
            'document_types',
            'templates',
            'numbering_sequences'
        ];
        
        for (const table of tablesToDrop) {
            await pool.query(`DROP TABLE IF EXISTS ${table}`);
        }
        console.log('🧹 Tablas previas eliminadas de forma segura.');

        // 1. Crear tabla areas
        await pool.query(`
            CREATE TABLE areas (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "areas" creada.');

        // 2. Crear tabla users con campos de licencia, estado y delegación
        await pool.query(`
            CREATE TABLE users (
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
                must_change_password TINYINT(1) DEFAULT 1,
                password_resets_today INT DEFAULT 0,
                last_password_reset_date DATE DEFAULT NULL,
                failed_login_attempts INT DEFAULT 0,
                lockout_until DATETIME DEFAULT NULL,
                FOREIGN KEY (area_id) REFERENCES areas(id),
                CONSTRAINT fk_users_superior FOREIGN KEY (superior_id) REFERENCES users(id) ON DELETE SET NULL,
                CONSTRAINT fk_users_delegated FOREIGN KEY (delegated_to) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "users" creada.');

        // 2b. Crear tabla password_history
        await pool.query(`
            CREATE TABLE password_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "password_history" creada.');

        // 3. Crear tablas de Roles y Permisos (RBAC) con descripciones para tooltips flotantes
        await pool.query(`
            CREATE TABLE roles (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "roles" creada.');

        await pool.query(`
            CREATE TABLE permissions (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "permissions" creada.');

        await pool.query(`
            CREATE TABLE role_permissions (
                role_id VARCHAR(50) NOT NULL,
                permission_id VARCHAR(50) NOT NULL,
                PRIMARY KEY (role_id, permission_id),
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "role_permissions" creada.');

        await pool.query(`
            CREATE TABLE user_roles (
                user_id VARCHAR(50) NOT NULL,
                role_id VARCHAR(50) NOT NULL,
                PRIMARY KEY (user_id, role_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "user_roles" creada.');

        // 4. Crear tabla templates (Plantillas dinámicas Fase 3)
        await pool.query(`
            CREATE TABLE templates (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                content TEXT NOT NULL,
                is_global BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "templates" creada.');

        // 5. Crear tabla document_types con template_id de Fase 3
        await pool.query(`
            CREATE TABLE document_types (
                code VARCHAR(10) PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                requires_signature BOOLEAN DEFAULT TRUE,
                allows_attachments BOOLEAN DEFAULT TRUE,
                is_reserved BOOLEAN DEFAULT FALSE,
                dest_type ENUM('none', 'single', 'multiple') DEFAULT 'none',
                template_id VARCHAR(50) NULL,
                FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "document_types" creada.');

        // 6. Crear tabla documents
        await pool.query(`
            CREATE TABLE documents (
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
                is_public BOOLEAN DEFAULT TRUE,
                auth_areas JSON,
                auth_users JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (creator_id) REFERENCES users(id),
                FOREIGN KEY (area_id) REFERENCES areas(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "documents" creada.');

        // 7. Crear tabla expedientes
        await pool.query(`
            CREATE TABLE expedientes (
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

        // 8. Crear tabla expediente_movements (pases inmutables)
        await pool.query(`
            CREATE TABLE expediente_movements (
                id VARCHAR(50) PRIMARY KEY,
                expediente_id VARCHAR(50) NOT NULL,
                sender_id VARCHAR(50) NOT NULL,
                sender_area_id VARCHAR(50) NOT NULL,
                receiver_id VARCHAR(50) DEFAULT NULL,
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

        // 9. Crear tabla numbering_sequences
        await pool.query(`
            CREATE TABLE numbering_sequences (
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
            CREATE TABLE history (
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
            CREATE TABLE notifications (
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

        // Reactivar foreign keys
        await pool.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('✅ Claves foráneas reactivadas con éxito.');

        // 12. Cargar datos maestros iniciales (Areas y Usuarios)
        console.log('📥 Cargando datos maestros iniciales...');
        await pool.query(`
            INSERT INTO areas (id, name) VALUES 
            ('a1', 'Dirección General'), 
            ('a2', 'Recursos Humanos'), 
            ('a3', 'Sistemas')
        `);

        const hash = await bcrypt.hash('123', 10);
        await pool.query(`
            INSERT INTO users (id, name, email, password, area_id, role, status) VALUES 
            ('u1', 'Admin Sistema', 'admin@gde.com', '${hash}', 'a3', 'admin', 'active'),
            ('u2', 'Juan Perez', 'juan@gde.com', '${hash}', 'a1', 'user', 'active'),
            ('u3', 'Maria Gomez', 'maria@gde.com', '${hash}', 'a2', 'user', 'active'),
            ('u4', 'Carlos Lopez', 'carlos@gde.com', '${hash}', 'a3', 'user', 'active')
        `);

        // 13. Cargar Roles, Permisos y Mapeos con descripciones informativas
        console.log('📥 Cargando configuración de seguridad RBAC...');
        
        const rolesData = [
            ['admin', 'Administrador Técnico', 'Administrador Técnico: Control total de usuarios, áreas, servidores y logs de auditoría.'],
            ['user', 'Usuario Estándar', 'Usuario Estándar: Permiso para redactar, revisar, firmar y realizar pases de expedientes.'],
            ['redactor', 'Redactor de Documentos', 'Redactor de Documentos: Especialista enfocado en la confección e inicio de borradores.'],
            ['revisor', 'Revisor de Trámites', 'Revisor de Trámites: Encargado de controlar la foliatura y contenido antes del sellado digital.'],
            ['firmante', 'Firmante Oficial', 'Firmante Oficial: Agente con potestad legal y token de firma para autorizar documentos públicos.'],
            ['auditor', 'Auditor Gubernamental', 'Auditor Gubernamental: Acceso exclusivo de sólo lectura a expedientes reservados y logs de auditoría.']
        ];

        for (const [id, name, desc] of rolesData) {
            await pool.query('INSERT INTO roles (id, name, description) VALUES (?, ?, ?)', [id, name, desc]);
        }

        const permsData = [
            ['doc_create', 'Crear Borrador de Documento', 'Crear Borrador de Documento: Permite iniciar y redactar borradores.'],
            ['doc_read', 'Visualizar Detalles de Documento', 'Visualizar Detalles de Documento: Permite ver el contenido y metadatos de documentos.'],
            ['doc_edit', 'Editar Borrador de Documento', 'Editar Borrador de Documento: Permite modificar borradores asignados.'],
            ['doc_delete', 'Eliminar Borrador de Documento', 'Eliminar Borrador de Documento: Permite borrar borradores propios.'],
            ['doc_sign', 'Aplicar Firma a Documento', 'Aplicar Firma a Documento: Permite aplicar firma electrónica a borradores.'],
            ['exp_create', 'Caratular / Iniciar Expediente', 'Caratular / Iniciar Expediente: Permite iniciar un nuevo expediente.'],
            ['exp_read', 'Visualizar Expediente', 'Visualizar Expediente: Permite consultar expedientes y sus fojas.'],
            ['exp_write', 'Editar Expediente y Vincular Fojas', 'Editar Expediente y Vincular Fojas: Permite agregar fojas a expedientes.'],
            ['exp_pase', 'Realizar Pase de Expediente', 'Realizar Pase de Expediente: Permite derivar expedientes a otros agentes/áreas.'],
            ['admin_users', 'Gestionar Usuarios', 'Gestionar Usuarios: Permite crear, modificar, suspender y eliminar usuarios.'],
            ['admin_areas', 'Gestionar Reparticiones / Áreas', 'Gestionar Reparticiones / Áreas: Permite configurar el organigrama de la institución.'],
            ['admin_services', 'Configurar Conectividad de Servidores', 'Configurar Conectividad de Servidores: Permite configurar SMTP, LDAP y 2FA.'],
            ['audit_logs', 'Acceso a Logs de Auditoría', 'Acceso a Logs de Auditoría: Permite ver la trazabilidad de acciones críticas en el sistema.'],
            ['doc_create_reserved', 'Crear Documentación Reservada', 'Crear Documentación Reservada: Permite iniciar documentación y expedientes en carácter de reservado.'],
            ['doc_sign_reserved', 'Firmar Documentación Reservada', 'Firmar Documentación Reservada: Permite firmar documentos de carácter reservado, requiriendo validación 2FA.']
        ];

        for (const [id, name, desc] of permsData) {
            await pool.query('INSERT INTO permissions (id, name, description) VALUES (?, ?, ?)', [id, name, desc]);
        }

        // Vincular todos los permisos al administrador
        for (const [permId] of permsData) {
            await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['admin', permId]);
        }

        // Vincular permisos estándar al usuario básico
        const userPerms = ['doc_create', 'doc_read', 'doc_edit', 'doc_delete', 'doc_sign', 'exp_create', 'exp_read', 'exp_write', 'exp_pase', 'doc_create_reserved', 'doc_sign_reserved'];
        for (const permId of userPerms) {
            await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['user', permId]);
        }

        // Vincular permiso de firma reservada al rol firmante
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['firmante', 'doc_sign_reserved']);

        // Mapear usuarios existentes a sus nuevos roles
        await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES ('u1', 'admin')");
        await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES ('u2', 'user')");
        await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES ('u3', 'user')");
        await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES ('u4', 'user')");

        console.log('📥 Cargando tipos de documentos...');
        await pool.query(`
            INSERT INTO document_types (code, name, requires_signature, allows_attachments, is_reserved, dest_type) VALUES 
            ('SOLI', 'Solicitud', 1, 1, 0, 'single'),
            ('SC', 'Solicitud de Compra', 1, 1, 0, 'single'),
            ('GASTO', 'Solicitud de Gasto', 1, 1, 0, 'single'),
            ('OC', 'Orden de Compra', 1, 1, 0, 'single'),
            ('CAR', 'Carta', 1, 1, 0, 'single'),
            ('ME', 'Memo', 1, 1, 0, 'multiple'),
            ('NO', 'Nota', 1, 1, 0, 'multiple'),
            ('NOTI', 'Notificación', 1, 1, 0, 'multiple'),
            ('CIRC', 'Circular', 1, 1, 0, 'multiple'),
            ('ACTA', 'Acta', 1, 1, 0, 'none'),
            ('IF', 'Informe', 1, 1, 0, 'none'),
            ('RESOL', 'Resolucion', 1, 1, 0, 'none'),
            ('DISP', 'Disposicion', 1, 1, 0, 'none'),
            ('ACTU', 'Actuacion', 1, 1, 0, 'none'),
            ('DICT', 'Dictamen', 1, 1, 0, 'none'),
            ('SANC', 'Sanción', 1, 1, 0, 'none'),
            ('CONF', 'Acuerdo de confidencialidad', 1, 1, 0, 'none'),
            ('FACT', 'Factura', 1, 1, 0, 'none'),
            ('PRESUP', 'Presupuesto', 1, 1, 0, 'none'),
            ('BAL', 'Balance', 1, 1, 0, 'none'),
            ('IFT', 'Informes Técnico', 1, 1, 0, 'none'),
            ('EVAL', 'Evaluación', 1, 1, 0, 'none'),
            ('MPROC', 'Manual de procedimientos', 1, 1, 0, 'none'),
            ('CCOND', 'Código de conducta', 1, 1, 0, 'none'),
            ('POL', 'Política Interna', 1, 1, 0, 'none'),
            ('CONT', 'Contrato', 1, 1, 0, 'none')
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
