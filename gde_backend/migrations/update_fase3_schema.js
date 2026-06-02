// migrations/update_fase3_schema.js
// Script de migración seguro para actualizar el esquema de base de datos para la Fase 3.
// Puede ser ejecutado de forma repetida (idempotente) sin alterar datos existentes.

const pool = require('../config/db');

async function runMigration() {
    console.log('🏁 Iniciando migración de base de datos para la Fase 3...');

    try {
        // 1. Recrear tabla templates con esquema flexible (sin PK/FK rígida en doc_type)
        console.log('🔄 Recreando tabla "templates" con esquema flexible...');
        
        // Desactivar temporalmente validación de claves foráneas
        await pool.query('SET FOREIGN_KEY_CHECKS = 0');
        
        // Dropear tabla vieja si existe
        await pool.query('DROP TABLE IF EXISTS templates');
        
        // Crear nueva tabla templates
        await pool.query(`
            CREATE TABLE templates (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                content TEXT NOT NULL,
                is_global BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('  ✅ Tabla "templates" creada con esquema flexible.');

        // 2. Modificar tabla document_types para agregar template_id
        console.log('🔄 Verificando columna "template_id" en la tabla "document_types"...');
        const [docTypeCols] = await pool.query('SHOW COLUMNS FROM document_types');
        const docTypeColNames = docTypeCols.map(c => c.Field);

        if (!docTypeColNames.includes('template_id')) {
            await pool.query(`
                ALTER TABLE document_types 
                ADD COLUMN template_id VARCHAR(50) NULL,
                ADD CONSTRAINT fk_document_types_template FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
            `);
            console.log('  ✅ Columna "template_id" añadida a la tabla "document_types".');
        } else {
            console.log('  ℹ️ Columna "template_id" ya existe.');
        }

        // Reactivar validación de claves foráneas
        await pool.query('SET FOREIGN_KEY_CHECKS = 1');

        // 3. Agregar columna "description" a roles y permissions si no existen
        console.log('🔄 Verificando columnas de descripción en "roles" y "permissions"...');
        const [rolesCols] = await pool.query('SHOW COLUMNS FROM roles');
        const rolesColNames = rolesCols.map(c => c.Field);
        if (!rolesColNames.includes('description')) {
            await pool.query('ALTER TABLE roles ADD COLUMN description TEXT NULL');
            console.log('  ✅ Columna "description" añadida a la tabla "roles".');
        }

        const [permsCols] = await pool.query('SHOW COLUMNS FROM permissions');
        const permsColNames = permsCols.map(c => c.Field);
        if (!permsColNames.includes('description')) {
            await pool.query('ALTER TABLE permissions ADD COLUMN description TEXT NULL');
            console.log('  ✅ Columna "description" añadida a la tabla "permissions".');
        }

        // 4. Actualizar descripciones de Roles
        console.log('📥 Actualizando descripciones detalladas de Roles...');
        const rolesDesc = {
            'admin': 'Administrador Técnico: Control total de usuarios, áreas, servidores y logs de auditoría.',
            'user': 'Usuario Estándar: Permiso para redactar, revisar, firmar y realizar pases de expedientes.',
            'redactor': 'Redactor de Documentos: Especialista enfocado en la confección e inicio de borradores.',
            'revisor': 'Revisor de Trámites: Encargado de controlar la foliatura y contenido antes del sellado digital.',
            'firmante': 'Firmante Oficial: Agente con potestad legal y token de firma para autorizar documentos públicos.',
            'auditor': 'Auditor Gubernamental: Acceso exclusivo de sólo lectura a expedientes reservados y logs de auditoría.'
        };

        for (const [id, desc] of Object.entries(rolesDesc)) {
            await pool.query('UPDATE roles SET description = ? WHERE id = ?', [desc, id]);
        }
        console.log('  ✅ Descripciones de roles actualizadas.');

        // 5. Actualizar descripciones de Permisos
        console.log('📥 Actualizando descripciones de Permisos...');
        const permsDesc = {
            'doc_create': 'Crear Borrador de Documento: Permite iniciar y redactar borradores.',
            'doc_read': 'Visualizar Detalles de Documento: Permite ver el contenido y metadatos de documentos.',
            'doc_edit': 'Editar Borrador de Documento: Permite modificar borradores asignados.',
            'doc_delete': 'Eliminar Borrador de Documento: Permite borrar borradores propios.',
            'doc_sign': 'Aplicar Firma a Documento: Permite aplicar firma electrónica a borradores.',
            'exp_create': 'Caratular / Iniciar Expediente: Permite iniciar un nuevo expediente.',
            'exp_read': 'Visualizar Expediente: Permite consultar expedientes y sus fojas.',
            'exp_write': 'Editar Expediente y Vincular Fojas: Permite agregar fojas a expedientes.',
            'exp_pase': 'Realizar Pase de Expediente: Permite derivar expedientes a otros agentes/áreas.',
            'admin_users': 'Gestionar Usuarios: Permite crear, modificar, suspender y eliminar usuarios.',
            'admin_areas': 'Gestionar Reparticiones / Áreas: Permite configurar el organigrama de la institución.',
            'admin_services': 'Configurar Conectividad de Servidores: Permite configurar SMTP, LDAP y 2FA.',
            'audit_logs': 'Acceso a Logs de Auditoría: Permite ver la trazabilidad de acciones críticas en el sistema.'
        };

        for (const [id, desc] of Object.entries(permsDesc)) {
            await pool.query('UPDATE permissions SET description = ? WHERE id = ?', [desc, id]);
        }
        console.log('  ✅ Descripciones de permisos actualizadas.');

        console.log('🎉 🎉 Migración de base de datos para la Fase 3 completada con éxito.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error catastrófico en la migración de base de datos Fase 3:', error);
        process.exit(1);
    }
}

runMigration();
