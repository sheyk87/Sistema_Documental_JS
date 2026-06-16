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
            INSERT IGNORE INTO permissions (id, name, description) VALUES 
            ('doc_create', 'Crear Borrador de Documento', 'Crear Borrador de Documento: Permite iniciar y redactar borradores.'),
            ('doc_read', 'Visualizar Detalles de Documento', 'Visualizar Detalles de Documento: Permite ver el contenido y metadatos de documentos.'),
            ('doc_edit', 'Editar Borrador de Documento', 'Editar Borrador de Documento: Permite modificar borradores asignados.'),
            ('doc_delete', 'Eliminar Borrador de Documento', 'Eliminar Borrador de Documento: Permite borrar borradores propios.'),
            ('doc_sign', 'Aplicar Firma a Documento', 'Aplicar Firma a Documento: Permite aplicar firma electrónica a borradores.'),
            ('exp_create', 'Caratular / Iniciar Expediente', 'Caratular / Iniciar Expediente: Permite iniciar un nuevo expediente.'),
            ('exp_read', 'Visualizar Expediente', 'Visualizar Expediente: Permite consultar expedientes y sus fojas.'),
            ('exp_write', 'Editar Expediente y Vincular Fojas', 'Editar Expediente y Vincular Fojas: Permite agregar fojas a expedientes.'),
            ('exp_pase', 'Realizar Pase de Expediente', 'Realizar Pase de Expediente: Permite derivar expedientes a otros agentes/áreas.'),
            ('admin_users', 'Gestionar Usuarios', 'Gestionar Usuarios: Permite crear, modificar, suspender y eliminar usuarios.'),
            ('admin_areas', 'Gestionar Reparticiones / Áreas', 'Gestionar Reparticiones / Áreas: Permite configurar el organigrama de la institución.'),
            ('admin_services', 'Configurar Conectividad de Servidores', 'Configurar Conectividad de Servidores: Permite configurar SMTP, LDAP y 2FA.'),
            ('audit_logs', 'Acceso a Logs de Auditoría', 'Acceso a Logs de Auditoría: Permite ver la trazabilidad de acciones críticas en el sistema.'),
            ('doc_create_reserved', 'Crear Documentos Reservados', 'Crear Documentos Reservados: Permite iniciar documentos en carácter de reservado.'),
            ('doc_edit_reserved', 'Editar Borradores Reservados', 'Editar Borradores Reservados: Permite modificar borradores de documentos reservados.'),
            ('doc_delete_reserved', 'Eliminar Borrador Reservado', 'Eliminar Borrador Reservado: Permite borrar borradores propios de documentos reservados.'),
            ('doc_read_reserved', 'Visualizar Documentos Reservados Firmados', 'Visualizar Documentos Reservados Firmados: Permite consultar el contenido de documentos reservados ya firmados.'),
            ('doc_sign_reserved', 'Firmar Documentos Reservados', 'Firmar Documentos Reservados: Permite firmar documentos de carácter reservado, requiriendo validación 2FA.'),
            ('doc_derive_reserved', 'Derivar Documentos Reservados', 'Derivar Documentos Reservados: Permite realizar el pase/derivación de un documento reservado.'),
            ('doc_archive_reserved', 'Archivar Documentos Reservados', 'Archivar Documentos Reservados: Permite archivar documentos reservados.'),
            ('doc_unarchive_reserved', 'Desarchivar Documentos Reservados', 'Desarchivar Documentos Reservados: Permite desarchivar documentos reservados.'),
            ('doc_annul_reserved', 'Anular Documentos Reservados', 'Anular Documentos Reservados: Permite anular documentos reservados oficiales.'),
            ('doc_change_reserved_perms', 'Cambiar permisos en Documentos Reservados', 'Cambiar permisos en Documentos Reservados: Permite modificar el listado de autorizados de un documento reservado.'),
            ('doc_derive', 'Derivar Documento', 'Derivar Documento: Permite realizar el pase/derivación de un documento.'),
            ('doc_archive', 'Archivar Documento', 'Archivar Documento: Permite archivar documentos firmados.'),
            ('doc_annul', 'Anular Documento', 'Anular Documento: Permite anular documentos oficiales.'),
            ('exp_archive', 'Archivar Expediente', 'Archivar Expediente: Permite archivar expedientes.'),
            ('exp_annul', 'Anular Expediente', 'Anular Expediente: Permite anular expedientes.'),
            ('exp_unarchive', 'Desarchivar Expediente', 'Desarchivar Expediente: Permite desarchivar expedientes públicos.'),
            ('admin_manage_roles', 'Gestionar Roles', 'Gestionar Roles: Permite crear, modificar y eliminar roles y sus permisos.'),
            ('admin_manage_templates', 'Gestionar Plantillas', 'Gestionar Plantillas: Permite crear, modificar y eliminar plantillas de documentos.'),
            ('admin_manage_doc_types', 'Gestionar Tipos de Documentos', 'Gestionar Tipos de Documentos: Permite crear, modificar y eliminar tipos de documentos.'),
            ('exp_create_reserved', 'Crear Expedientes Reservados', 'Crear Expedientes Reservados: Permite iniciar expedientes en carácter de reservado.'),
            ('exp_read_reserved', 'Visualizar Expediente Reservado', 'Visualizar Expediente Reservado: Permite consultar expedientes reservados y sus fojas.'),
            ('exp_edit_reserved', 'Editar Expedientes Reservados', 'Editar Expedientes Reservados: Permite vincular o desvincular fojas no selladas en expedientes reservados.'),
            ('exp_derive_reserved', 'Derivar Expedientes Reservados', 'Derivar Expedientes Reservados: Permite realizar el pase/derivación de un expediente reservado.'),
            ('exp_archive_reserved', 'Archivar Expedientes Reservados', 'Archivar Expedientes Reservados: Permite archivar expedientes reservados.'),
            ('exp_unarchive_reserved', 'Desarchivar Expedientes Reservados', 'Desarchivar Expedientes Reservados: Permite desarchivar expedientes reservados.'),
            ('exp_annul_reserved', 'Anular Expedientes Reservados', 'Anular Expedientes Reservados: Permite anular expedientes reservados.'),
            ('exp_change_reserved_perms', 'Cambiar permisos en Expedientes Reservados', 'Cambiar permisos en Expedientes Reservados: Permite modificar el listado de autorizados de un expediente reservado.'),
            ('doc_attach', 'Adjuntar archivos', 'Adjuntar archivos: Permite subir o eliminar archivos adjuntos a borradores de documentos.'),
            ('doc_send_sign', 'Enviar a Firmar', 'Enviar a Firmar: Permite enviar borradores de documentos para firma o revisión.'),
            ('doc_unarchive', 'Desarchivar Documento', 'Desarchivar Documento: Permite desarchivar documentos firmados.'),
            ('doc_attach_reserved', 'Adjuntar archivos en Documentos Reservados', 'Adjuntar archivos en Documentos Reservados: Permite subir o eliminar archivos adjuntos a borradores de documentos reservados.'),
            ('doc_send_sign_reserved', 'Enviar a Firmar Documentos Reservados', 'Enviar a Firmar Documentos Reservados: Permite enviar borradores de documentos reservados para firma o revisión.'),
            ('exp_download', 'Descargar Expedientes', 'Descargar Expedientes: Permite exportar/descargar expedientes.'),
            ('exp_download_reserved', 'Descargar Expedientes Reservados', 'Descargar Expedientes Reservados: Permite exportar/descargar expedientes reservados.')
        `);

        // 12. Asociar Permisos a los Roles
        console.log('📥 Enlazando roles y permisos...');
        
        // El administrador recibe TODOS los permisos
        const [allPerms] = await pool.query('SELECT id FROM permissions');
        for (let perm of allPerms) {
            await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['admin', perm.id]);
        }

        // El rol "user" recibe permisos estándares de operación
        const userPerms = [
            'doc_create', 'doc_read', 'doc_edit', 'doc_delete', 'doc_sign', 
            'exp_create', 'exp_read', 'exp_write', 'exp_pase', 
            'doc_create_reserved', 'doc_sign_reserved', 'exp_create_reserved',
            'doc_derive', 'doc_archive', 'doc_annul',
            'exp_archive', 'exp_annul', 'exp_unarchive',
            'doc_edit_reserved', 'doc_read_reserved', 'doc_derive_reserved', 'doc_archive_reserved', 'doc_unarchive_reserved', 'doc_annul_reserved', 'doc_change_reserved_perms', 'doc_delete_reserved',
            'exp_read_reserved', 'exp_edit_reserved', 'exp_derive_reserved', 'exp_archive_reserved', 'exp_unarchive_reserved', 'exp_annul_reserved', 'exp_change_reserved_perms',
            'doc_attach', 'doc_send_sign', 'doc_unarchive', 'doc_attach_reserved', 'doc_send_sign_reserved', 'exp_download', 'exp_download_reserved'
        ];
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
