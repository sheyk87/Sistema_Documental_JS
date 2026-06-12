// migrations/update_permissions_db.js
const pool = require('../config/db');

async function runUpdate() {
    console.log('🔄 Iniciando actualización de permisos granulares en base de datos...');
    try {
        const permsData = [
            ['doc_derive', 'Derivar Documento', 'Derivar Documento: Permite realizar el pase/derivación de un documento.'],
            ['doc_archive', 'Archivar Documento', 'Archivar Documento: Permite archivar documentos firmados.'],
            ['doc_annul', 'Anular Documento', 'Anular Documento: Permite anular documentos oficiales.'],
            ['exp_archive', 'Archivar Expediente', 'Archivar Expediente: Permite archivar expedientes.'],
            ['exp_annul', 'Anular Expediente', 'Anular Expediente: Permite anular expedientes.'],
            ['admin_manage_roles', 'Gestionar Roles', 'Gestionar Roles: Permite crear, modificar y eliminar roles y sus permisos.'],
            ['admin_manage_templates', 'Gestionar Plantillas', 'Gestionar Plantillas: Permite crear, modificar y eliminar plantillas de documentos.'],
            ['admin_manage_doc_types', 'Gestionar Tipos de Documentos', 'Gestionar Tipos de Documentos: Permite crear, modificar y eliminar tipos de documentos.'],
            ['exp_create_reserved', 'Crear Expedientes Reservados', 'Crear Expedientes Reservados: Permite iniciar expedientes en carácter de reservado.']
        ];

        // 1. Insertar nuevos permisos
        for (const [id, name, desc] of permsData) {
            await pool.query(
                'INSERT INTO permissions (id, name, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, description = ?',
                [id, name, desc, name, desc]
            );
            console.log(`✅ Permiso registrado/actualizado: ${id}`);
        }

        // 2. Corregir descripciones de los permisos de reserva previos
        await pool.query(
            "UPDATE permissions SET name = 'Crear Documentos Reservados', description = 'Crear Documentos Reservados: Permite iniciar documentos en carácter de reservado.' WHERE id = 'doc_create_reserved'"
        );
        await pool.query(
            "UPDATE permissions SET name = 'Firmar Documentos Reservados', description = 'Firmar Documentos Reservados: Permite firmar documentos de carácter reservado, requiriendo validación 2FA.' WHERE id = 'doc_sign_reserved'"
        );
        console.log('✅ Descripciones de permisos existentes actualizadas.');

        // 3. Vincular TODOS los permisos al rol 'admin'
        const [allPerms] = await pool.query('SELECT id FROM permissions');
        for (let perm of allPerms) {
            await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['admin', perm.id]);
        }
        console.log('✅ Todos los permisos vinculados al rol "admin".');

        // 4. Vincular permisos estándares al rol 'user'
        const userPerms = [
            'doc_create', 'doc_read', 'doc_edit', 'doc_delete', 'doc_sign', 
            'exp_create', 'exp_read', 'exp_write', 'exp_pase', 
            'doc_create_reserved', 'doc_sign_reserved', 'exp_create_reserved',
            'doc_derive', 'doc_archive', 'doc_annul',
            'exp_archive', 'exp_annul'
        ];
        for (let permId of userPerms) {
            await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['user', permId]);
        }
        console.log('✅ Permisos operacionales por defecto vinculados al rol "user".');

        console.log('🎉 ¡Actualización de permisos completada exitosamente!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error actualizando permisos granulares:', error);
        process.exit(1);
    }
}

runUpdate();
