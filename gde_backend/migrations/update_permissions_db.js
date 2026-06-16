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
            ['exp_create_reserved', 'Crear Expedientes Reservados', 'Crear Expedientes Reservados: Permite iniciar expedientes en carácter de reservado.'],
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
            ['doc_derive', 'Derivar Documento', 'Derivar Documento: Permite realizar el pase/derivación de un documento.'],
            ['doc_archive', 'Archivar Documento', 'Archivar Documento: Permite archivar documentos firmados.'],
            ['doc_annul', 'Anular Documento', 'Anular Documento: Permite anular documentos oficiales.'],
            ['exp_archive', 'Archivar Expediente', 'Archivar Expediente: Permite archivar expedientes.'],
            ['exp_annul', 'Anular Expediente', 'Anular Expediente: Permite anular expedientes.'],
            ['exp_unarchive', 'Desarchivar Expediente', 'Desarchivar Expediente: Permite desarchivar expedientes públicos.'],
            ['admin_manage_roles', 'Gestionar Roles', 'Gestionar Roles: Permite crear, modificar y eliminar roles y sus permisos.'],
            ['admin_manage_templates', 'Gestionar Plantillas', 'Gestionar Plantillas: Permite crear, modificar y eliminar plantillas de documentos.'],
            ['admin_manage_doc_types', 'Gestionar Tipos de Documentos', 'Gestionar Tipos de Documentos: Permite crear, modificar y eliminar tipos de documentos.'],
            ['exp_create_reserved', 'Crear Expedientes Reservados', 'Crear Expedientes Reservados: Permite iniciar expedientes en carácter de reservado.'],
            ['exp_read_reserved', 'Visualizar Expediente Reservado', 'Visualizar Expediente Reservado: Permite consultar expedientes reservados y sus fojas.'],
            ['exp_edit_reserved', 'Editar Expedientes Reservados', 'Editar Expedientes Reservados: Permite vincular o desvincular fojas no selladas en expedientes reservados.'],
            ['exp_derive_reserved', 'Derivar Expedientes Reservados', 'Derivar Expedientes Reservados: Permite realizar el pase/derivación de un expediente reservado.'],
            ['exp_archive_reserved', 'Archivar Expedientes Reservados', 'Archivar Expedientes Reservados: Permite archivar expedientes reservados.'],
            ['exp_unarchive_reserved', 'Desarchivar Expedientes Reservados', 'Desarchivar Expedientes Reservados: Permite desarchivar expedientes reservados.'],
            ['exp_annul_reserved', 'Anular Expedientes Reservados', 'Anular Expedientes Reservados: Permite anular expedientes reservados.'],
            ['exp_change_reserved_perms', 'Cambiar permisos en Expedientes Reservados', 'Cambiar permisos en Expedientes Reservados: Permite modificar el listado de autorizados de un expediente reservado.'],
            ['doc_attach', 'Adjuntar archivos', 'Adjuntar archivos: Permite subir o eliminar archivos adjuntos a borradores de documentos.'],
            ['doc_send_sign', 'Enviar a Firmar', 'Enviar a Firmar: Permite enviar borradores de documentos para firma o revisión.'],
            ['doc_unarchive', 'Desarchivar Documento', 'Desarchivar Documento: Permite desarchivar documentos firmados.'],
            ['doc_attach_reserved', 'Adjuntar archivos en Documentos Reservados', 'Adjuntar archivos en Documentos Reservados: Permite subir o eliminar archivos adjuntos a borradores de documentos reservados.'],
            ['doc_send_sign_reserved', 'Enviar a Firmar Documentos Reservados', 'Enviar a Firmar Documentos Reservados: Permite enviar borradores de documentos reservados para firma o revisión.'],
            ['exp_download', 'Descargar Expedientes', 'Descargar Expedientes: Permite exportar/descargar expedientes.'],
            ['exp_download_reserved', 'Descargar Expedientes Reservados', 'Descargar Expedientes Reservados: Permite exportar/descargar expedientes reservados.']
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
            'exp_archive', 'exp_annul', 'exp_unarchive',
            'doc_edit_reserved', 'doc_read_reserved', 'doc_derive_reserved', 'doc_archive_reserved', 'doc_unarchive_reserved', 'doc_annul_reserved', 'doc_change_reserved_perms', 'doc_delete_reserved',
            'exp_read_reserved', 'exp_edit_reserved', 'exp_derive_reserved', 'exp_archive_reserved', 'exp_unarchive_reserved', 'exp_annul_reserved', 'exp_change_reserved_perms',
            'doc_attach', 'doc_send_sign', 'doc_unarchive', 'doc_attach_reserved', 'doc_send_sign_reserved', 'exp_download', 'exp_download_reserved'
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
