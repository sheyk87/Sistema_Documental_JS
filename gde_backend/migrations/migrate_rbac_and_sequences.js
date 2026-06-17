// migrations/migrate_rbac_and_sequences.js
// Script incremental para actualizar el esquema de base de datos MySQL.
// Sincronizado con setup_full.js — Seguro de re-ejecutar (idempotente).

const pool = require('../config/db');

async function runMigration() {
    console.log('🏁 Iniciando migración incremental de base de datos...');

    try {
        // ────────────────────────────────────────────────────────────
        // 1. Crear tabla roles (con columna description)
        // ────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        // Asegurar que la columna description exista si la tabla fue creada sin ella
        try {
            await pool.query('ALTER TABLE roles ADD COLUMN description TEXT NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        console.log('✅ Tabla "roles" verificada.');

        // ────────────────────────────────────────────────────────────
        // 2. Crear tabla permissions (con columna description)
        // ────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS permissions (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        try {
            await pool.query('ALTER TABLE permissions ADD COLUMN description TEXT NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        console.log('✅ Tabla "permissions" verificada.');

        // ────────────────────────────────────────────────────────────
        // 3. Crear tabla asociativa role_permissions
        // ────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id VARCHAR(50) NOT NULL,
                permission_id VARCHAR(50) NOT NULL,
                PRIMARY KEY (role_id, permission_id),
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "role_permissions" verificada.');

        // ────────────────────────────────────────────────────────────
        // 4. Crear tabla asociativa user_roles
        // ────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_roles (
                user_id VARCHAR(50) NOT NULL,
                role_id VARCHAR(50) NOT NULL,
                PRIMARY KEY (user_id, role_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "user_roles" verificada.');

        // ────────────────────────────────────────────────────────────
        // 5. Crear tabla numbering_sequences
        // ────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS numbering_sequences (
                id INT AUTO_INCREMENT PRIMARY KEY,
                doc_type VARCHAR(50) NOT NULL,
                year INT NOT NULL,
                \`last_value\` INT NOT NULL DEFAULT 0,
                UNIQUE KEY uq_type_year (doc_type, year)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "numbering_sequences" verificada.');

        // ────────────────────────────────────────────────────────────
        // 6. Crear tabla expediente_movements (receiver_id nullable)
        // ────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS expediente_movements (
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
        // Asegurar nullabilidad de receiver_id si tabla pre-existente
        try {
            await pool.query('ALTER TABLE expediente_movements MODIFY COLUMN receiver_id VARCHAR(50) DEFAULT NULL');
        } catch (_) { /* ignorar */ }
        console.log('✅ Tabla "expediente_movements" verificada.');

        // ────────────────────────────────────────────────────────────
        // 7. Crear tabla templates (Fase 3 — is_global, sin FK a doc_types)
        // ────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS templates (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                content TEXT NOT NULL,
                is_global BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        // Si la tabla pre-existente tiene la columna doc_type (Fase 2), eliminarla
        try {
            // Primero eliminar la FK si existe
            const [fks] = await pool.query(`
                SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'templates'
                AND REFERENCED_TABLE_NAME IS NOT NULL AND COLUMN_NAME = 'doc_type'
            `);
            for (const fk of fks) {
                await pool.query(`ALTER TABLE templates DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
            }
            await pool.query('ALTER TABLE templates DROP COLUMN doc_type');
        } catch (_) { /* columna ya no existe, ignorar */ }
        // Asegurar columna is_global
        try {
            await pool.query('ALTER TABLE templates ADD COLUMN is_global BOOLEAN DEFAULT FALSE');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        console.log('✅ Tabla "templates" verificada (Fase 3).');

        // ────────────────────────────────────────────────────────────
        // 8. Crear tabla document_types (con dest_type y template_id)
        // ────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS document_types (
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
        // Asegurar columnas dest_type y template_id si tabla pre-existente
        try {
            await pool.query("ALTER TABLE document_types ADD COLUMN dest_type ENUM('none', 'single', 'multiple') DEFAULT 'none'");
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await pool.query('ALTER TABLE document_types ADD COLUMN template_id VARCHAR(50) NULL');
            await pool.query('ALTER TABLE document_types ADD CONSTRAINT fk_dt_template FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_FK_DUP_NAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
        }
        console.log('✅ Tabla "document_types" verificada (con dest_type y template_id).');

        // ────────────────────────────────────────────────────────────
        // 9. Crear tabla password_history
        // ────────────────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Tabla "password_history" verificada.');

        // ────────────────────────────────────────────────────────────
        // 10. Modificar tabla users — Agregar todas las columnas faltantes
        // ────────────────────────────────────────────────────────────
        const [columns] = await pool.query('SHOW COLUMNS FROM users');
        const columnNames = columns.map(c => c.Field);

        // Asegurar que la columna 'role' permita roles dinámicos (VARCHAR(50)) en lugar de ENUM
        await pool.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(50) DEFAULT 'user'");

        const userColumnsToAdd = [
            { name: 'areas', sql: 'ALTER TABLE users ADD COLUMN areas JSON' },
            { name: 'web_notifications', sql: 'ALTER TABLE users ADD COLUMN web_notifications BOOLEAN DEFAULT TRUE' },
            { name: 'email_notifications', sql: 'ALTER TABLE users ADD COLUMN email_notifications BOOLEAN DEFAULT TRUE' },
            { name: 'status', sql: "ALTER TABLE users ADD COLUMN status ENUM('active', 'inactive', 'suspended') DEFAULT 'active'" },
            { name: 'superior_id', sql: 'ALTER TABLE users ADD COLUMN superior_id VARCHAR(50) DEFAULT NULL, ADD CONSTRAINT fk_users_superior FOREIGN KEY (superior_id) REFERENCES users(id) ON DELETE SET NULL' },
            { name: 'delegated_to', sql: 'ALTER TABLE users ADD COLUMN delegated_to VARCHAR(50) DEFAULT NULL, ADD CONSTRAINT fk_users_delegated FOREIGN KEY (delegated_to) REFERENCES users(id) ON DELETE SET NULL' },
            { name: 'licence_start', sql: 'ALTER TABLE users ADD COLUMN licence_start DATETIME DEFAULT NULL' },
            { name: 'licence_end', sql: 'ALTER TABLE users ADD COLUMN licence_end DATETIME DEFAULT NULL' },
            { name: 'must_change_password', sql: 'ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) DEFAULT 1' },
            { name: 'password_resets_today', sql: 'ALTER TABLE users ADD COLUMN password_resets_today INT DEFAULT 0' },
            { name: 'last_password_reset_date', sql: 'ALTER TABLE users ADD COLUMN last_password_reset_date DATE DEFAULT NULL' },
            { name: 'failed_login_attempts', sql: 'ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0' },
            { name: 'lockout_until', sql: 'ALTER TABLE users ADD COLUMN lockout_until DATETIME DEFAULT NULL' },
            { name: 'can_create_expedientes', sql: 'ALTER TABLE users ADD COLUMN can_create_expedientes TINYINT(1) DEFAULT 1' },
            { name: 'allowed_doc_types', sql: 'ALTER TABLE users ADD COLUMN allowed_doc_types JSON DEFAULT NULL' }
        ];

        for (const col of userColumnsToAdd) {
            if (!columnNames.includes(col.name)) {
                try {
                    await pool.query(col.sql);
                    console.log(`  ✅ Columna "${col.name}" añadida a la tabla "users".`);
                } catch (e) {
                    // Ignorar si la FK ya existe con otro nombre
                    if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_FK_DUP_NAME') {
                        console.error(`  ⚠️  Error añadiendo columna "${col.name}":`, e.message);
                    }
                }
            }
        }
        console.log('✅ Tabla "users" verificada con todas las columnas.');

        // ────────────────────────────────────────────────────────────
        // 11. Cargar Roles Básicos (con descripciones)
        // ────────────────────────────────────────────────────────────
        console.log('📥 Cargando roles básicos...');
        const rolesData = [
            ['admin', 'Administrador Técnico', 'Administrador Técnico: Control total de usuarios, áreas, servidores y logs de auditoría.'],
            ['user', 'Usuario Estándar', 'Usuario Estándar: Permiso para redactar, revisar, firmar y realizar pases de expedientes.'],
            ['redactor', 'Redactor de Documentos', 'Redactor de Documentos: Especialista enfocado en la confección e inicio de borradores.'],
            ['revisor', 'Revisor de Trámites', 'Revisor de Trámites: Encargado de controlar la foliatura y contenido antes del sellado digital.'],
            ['firmante', 'Firmante Oficial', 'Firmante Oficial: Agente con potestad legal y token de firma para autorizar documentos públicos.'],
            ['auditor', 'Auditor Gubernamental', 'Auditor Gubernamental: Acceso exclusivo de sólo lectura a expedientes reservados y logs de auditoría.']
        ];
        for (const [id, name, desc] of rolesData) {
            await pool.query(
                'INSERT INTO roles (id, name, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)',
                [id, name, desc]
            );
        }
        console.log('✅ Roles básicos verificados.');

        // ────────────────────────────────────────────────────────────
        // 12. Cargar Permisos Granulares (todos los 46 permisos)
        // ────────────────────────────────────────────────────────────
        console.log('📥 Cargando permisos granulares...');
        const permsData = [
            ['doc_create', 'Crear Borrador de Documento', 'Crear Borrador de Documento: Permite iniciar y redactar borradores.'],
            ['doc_read', 'Visualizar Detalles de Documento', 'Visualizar Detalles de Documento: Permite ver el contenido y metadatos de documentos.'],
            ['doc_edit', 'Editar Borrador de Documento', 'Editar Borrador de Documento: Permite modificar borradores asignados.'],
            ['doc_delete', 'Eliminar Borrador de Documento', 'Eliminar Borrador de Documento: Permite borrar borradores propios.'],
            ['doc_sign', 'Aplicar Firma a Documento', 'Aplicar Firma a Documento: Permite aplicar firma electrónica a borradores.'],
            ['doc_derive', 'Derivar Documento', 'Derivar Documento: Permite realizar el pase/derivación de un documento.'],
            ['doc_archive', 'Archivar Documento', 'Archivar Documento: Permite archivar documentos firmados.'],
            ['doc_unarchive', 'Desarchivar Documento', 'Desarchivar Documento: Permite desarchivar documentos firmados.'],
            ['doc_annul', 'Anular Documento', 'Anular Documento: Permite anular documentos oficiales.'],
            ['doc_attach', 'Adjuntar archivos', 'Adjuntar archivos: Permite subir o eliminar archivos adjuntos a borradores de documentos.'],
            ['doc_send_sign', 'Enviar a Firmar', 'Enviar a Firmar: Permite enviar borradores de documentos para firma o revisión.'],
            ['exp_create', 'Caratular / Iniciar Expediente', 'Caratular / Iniciar Expediente: Permite iniciar un nuevo expediente.'],
            ['exp_read', 'Visualizar Expediente', 'Visualizar Expediente: Permite consultar expedientes y sus fojas.'],
            ['exp_write', 'Editar Expediente y Vincular Fojas', 'Editar Expediente y Vincular Fojas: Permite agregar fojas a expedientes.'],
            ['exp_pase', 'Realizar Pase de Expediente', 'Realizar Pase de Expediente: Permite derivar expedientes a otros agentes/áreas.'],
            ['exp_archive', 'Archivar Expediente', 'Archivar Expediente: Permite archivar expedientes.'],
            ['exp_unarchive', 'Desarchivar Expediente', 'Desarchivar Expediente: Permite desarchivar expedientes públicos.'],
            ['exp_annul', 'Anular Expediente', 'Anular Expediente: Permite anular expedientes.'],
            ['exp_download', 'Descargar Expedientes', 'Descargar Expedientes: Permite exportar/descargar expedientes.'],
            ['admin_users', 'Gestionar Usuarios', 'Gestionar Usuarios: Permite crear, modificar, suspender y eliminar usuarios.'],
            ['admin_areas', 'Gestionar Reparticiones / Áreas', 'Gestionar Reparticiones / Áreas: Permite configurar el organigrama de la institución.'],
            ['admin_services', 'Configurar Conectividad de Servidores', 'Configurar Conectividad de Servidores: Permite configurar SMTP, LDAP y 2FA.'],
            ['audit_logs', 'Acceso a Logs de Auditoría', 'Acceso a Logs de Auditoría: Permite ver la trazabilidad de acciones críticas en el sistema.'],
            ['admin_manage_roles', 'Gestionar Roles', 'Gestionar Roles: Permite crear, modificar y eliminar roles y sus permisos.'],
            ['admin_manage_templates', 'Gestionar Plantillas', 'Gestionar Plantillas: Permite crear, modificar y eliminar plantillas de documentos.'],
            ['admin_manage_doc_types', 'Gestionar Tipos de Documentos', 'Gestionar Tipos de Documentos: Permite crear, modificar y eliminar tipos de documentos.'],
            ['doc_create_reserved', 'Crear Documentos Reservados', 'Crear Documentos Reservados: Permite iniciar documentos en carácter de reservado.'],
            ['doc_edit_reserved', 'Editar Borradores Reservados', 'Editar Borradores Reservados: Permite modificar borradores de documentos reservados.'],
            ['doc_delete_reserved', 'Eliminar Borrador Reservado', 'Eliminar Borrador Reservado: Permite borrar borradores propios de documentos reservados.'],
            ['doc_read_reserved', 'Visualizar Documentos Reservados Firmados', 'Visualizar Documentos Reservados Firmados: Permite consultar el contenido de documentos reservados ya firmados.'],
            ['doc_sign_reserved', 'Firmar Documentos Reservados', 'Firmar Documentos Reservados: Permite firmar documentos de carácter reservado, requiriendo validación 2FA.'],
            ['doc_derive_reserved', 'Derivar Documentos Reservados', 'Derivar Documentos Reservados: Permite realizar el pase/derivación de un documento reservado.'],
            ['doc_archive_reserved', 'Archivar Documentos Reservados', 'Archivar Documentos Reservados: Permite archivar documentos reservados.'],
            ['doc_unarchive_reserved', 'Desarchivar Documentos Reservados', 'Desarchivar Documentos Reservados: Permite desarchivar documentos reservados.'],
            ['doc_annul_reserved', 'Anular Documentos Reservados', 'Anular Documentos Reservados: Permite anular documentos reservados oficiales.'],
            ['doc_change_reserved_perms', 'Cambiar permisos en Documentos Reservados', 'Cambiar permisos en Documentos Reservados: Permite modificar el listado de autorizados de un documento reservado.'],
            ['doc_attach_reserved', 'Adjuntar archivos en Documentos Reservados', 'Adjuntar archivos en Documentos Reservados: Permite subir o eliminar archivos adjuntos a borradores de documentos reservados.'],
            ['doc_send_sign_reserved', 'Enviar a Firmar Documentos Reservados', 'Enviar a Firmar Documentos Reservados: Permite enviar borradores de documentos reservados para firma o revisión.'],
            ['exp_create_reserved', 'Crear Expedientes Reservados', 'Crear Expedientes Reservados: Permite iniciar expedientes en carácter de reservado.'],
            ['exp_read_reserved', 'Visualizar Expediente Reservado', 'Visualizar Expediente Reservado: Permite consultar expedientes reservados y sus fojas.'],
            ['exp_edit_reserved', 'Editar Expedientes Reservados', 'Editar Expedientes Reservados: Permite vincular o desvincular fojas no selladas en expedientes reservados.'],
            ['exp_derive_reserved', 'Derivar Expedientes Reservados', 'Derivar Expedientes Reservados: Permite realizar el pase/derivación de un expediente reservado.'],
            ['exp_archive_reserved', 'Archivar Expedientes Reservados', 'Archivar Expedientes Reservados: Permite archivar expedientes reservados.'],
            ['exp_unarchive_reserved', 'Desarchivar Expedientes Reservados', 'Desarchivar Expedientes Reservados: Permite desarchivar expedientes reservados.'],
            ['exp_annul_reserved', 'Anular Expedientes Reservados', 'Anular Expedientes Reservados: Permite anular expedientes reservados.'],
            ['exp_change_reserved_perms', 'Cambiar permisos en Expedientes Reservados', 'Cambiar permisos en Expedientes Reservados: Permite modificar el listado de autorizados de un expediente reservado.'],
            ['exp_download_reserved', 'Descargar Expedientes Reservados', 'Descargar Expedientes Reservados: Permite exportar/descargar expedientes reservados.']
        ];

        for (const [id, name, desc] of permsData) {
            await pool.query(
                'INSERT INTO permissions (id, name, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)',
                [id, name, desc]
            );
        }
        console.log('✅ Permisos granulares verificados (47 permisos).');

        // ────────────────────────────────────────────────────────────
        // 13. Asociar Permisos a los Roles
        // ────────────────────────────────────────────────────────────
        console.log('📥 Enlazando roles y permisos...');

        // El administrador recibe TODOS los permisos
        const [allPerms] = await pool.query('SELECT id FROM permissions');
        for (const perm of allPerms) {
            await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['admin', perm.id]);
        }

        // El rol "user" recibe permisos estándares de operación
        const userPerms = [
            'doc_create', 'doc_read', 'doc_edit', 'doc_delete', 'doc_sign',
            'doc_derive', 'doc_archive', 'doc_unarchive', 'doc_annul',
            'doc_attach', 'doc_send_sign',
            'exp_create', 'exp_read', 'exp_write', 'exp_pase',
            'exp_archive', 'exp_unarchive', 'exp_annul', 'exp_download',
            'doc_create_reserved', 'doc_edit_reserved', 'doc_delete_reserved',
            'doc_read_reserved', 'doc_sign_reserved',
            'doc_derive_reserved', 'doc_archive_reserved', 'doc_unarchive_reserved',
            'doc_annul_reserved', 'doc_change_reserved_perms',
            'doc_attach_reserved', 'doc_send_sign_reserved',
            'exp_create_reserved', 'exp_read_reserved', 'exp_edit_reserved',
            'exp_derive_reserved', 'exp_archive_reserved', 'exp_unarchive_reserved',
            'exp_annul_reserved', 'exp_change_reserved_perms',
            'exp_download_reserved'
        ];
        for (const permId of userPerms) {
            await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['user', permId]);
        }

        // Vincular permiso de firma reservada al rol firmante
        await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['firmante', 'doc_sign_reserved']);

        console.log('✅ Permisos vinculados a los roles.');

        // ────────────────────────────────────────────────────────────
        // 14. Mapear roles antiguos a la tabla user_roles (retrocompatibilidad)
        // ────────────────────────────────────────────────────────────
        console.log('📥 Mapeando usuarios existentes a sus nuevos roles...');
        const [existingUsers] = await pool.query('SELECT id, role FROM users');
        for (const u of existingUsers) {
            const targetRole = u.role === 'admin' ? 'admin' : 'user';
            await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [u.id, targetRole]);
        }

        // ────────────────────────────────────────────────────────────
        // 15. Cargar tipos documentales completos (26 tipos)
        // ────────────────────────────────────────────────────────────
        console.log('📥 Cargando tipos de documentos...');
        await pool.query(`
            INSERT IGNORE INTO document_types (code, name, requires_signature, allows_attachments, is_reserved, dest_type) VALUES
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
        console.log('✅ Tipos documentales verificados (26 tipos).');

        console.log('🎉 ¡Migración incremental completada exitosamente sin pérdida de datos!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error catastrófico en la migración de base de datos:', error);
        process.exit(1);
    }
}

runMigration();
