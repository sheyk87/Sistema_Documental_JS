// reset_db.js
// Script de limpieza profunda y restablecimiento de la base de datos a su estado semilla original.

const pool = require('./config/db');
const bcrypt = require('bcrypt');

async function resetData() {
    let connection;
    try {
        console.log('🏁 Iniciando limpieza profunda de la base de datos...');
        connection = await pool.getConnection();

        // Desactivamos temporalmente las restricciones de llaves foráneas
        await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

        // 1. Limpieza de tablas transaccionales
        await connection.query('TRUNCATE TABLE history');
        await connection.query('TRUNCATE TABLE notifications');
        await connection.query('TRUNCATE TABLE expediente_movements');
        await connection.query('TRUNCATE TABLE expedientes');
        await connection.query('TRUNCATE TABLE documents');
        await connection.query('TRUNCATE TABLE templates');
        await connection.query('TRUNCATE TABLE password_history');
        await connection.query('TRUNCATE TABLE numbering_sequences');
        console.log('🧹 Tablas transaccionales limpiadas.');

        // 2. Limpieza de tablas maestras y de configuración para re-sembrado
        await connection.query('DELETE FROM user_roles');
        await connection.query('DELETE FROM role_permissions');
        await connection.query('DELETE FROM permissions');
        await connection.query('DELETE FROM roles');
        await connection.query('DELETE FROM users');
        await connection.query('DELETE FROM areas');
        await connection.query('DELETE FROM document_types');
        console.log('🧹 Tablas maestras vaciadas.');

        // 3. Sembrado de Áreas
        await connection.query(`
            INSERT INTO areas (id, name) VALUES 
            ('a1', 'Dirección General'), 
            ('a2', 'Recursos Humanos'), 
            ('a3', 'Sistemas')
        `);
        console.log('✅ Áreas iniciales sembradas.');

        // 4. Sembrado de Usuarios
        const hash = await bcrypt.hash('123', 10);
        await connection.query(`
            INSERT INTO users (id, name, email, password, area_id, role, status) VALUES 
            ('u1', 'Admin Sistema', 'admin@gde.com', '${hash}', 'a3', 'admin', 'active'),
            ('u2', 'Juan Perez', 'juan@gde.com', '${hash}', 'a1', 'user', 'active'),
            ('u3', 'Maria Gomez', 'maria@gde.com', '${hash}', 'a2', 'user', 'active'),
            ('u4', 'Carlos Lopez', 'carlos@gde.com', '${hash}', 'a3', 'user', 'active')
        `);
        console.log('✅ Usuarios iniciales sembrados.');

        // 5. Sembrado de Roles
        const rolesData = [
            ['admin', 'Administrador Técnico', 'Administrador Técnico: Control total de usuarios, áreas, servidores y logs de auditoría.'],
            ['user', 'Usuario Estándar', 'Usuario Estándar: Permiso para redactar, revisar, firmar y realizar pases de expedientes.'],
            ['redactor', 'Redactor de Documentos', 'Redactor de Documentos: Especialista enfocado en la confección e inicio de borradores.'],
            ['revisor', 'Revisor de Trámites', 'Revisor de Trámites: Encargado de controlar la foliatura y contenido antes del sellado digital.'],
            ['firmante', 'Firmante Oficial', 'Firmante Oficial: Agente con potestad legal y token de firma para autorizar documentos públicos.'],
            ['auditor', 'Auditor Gubernamental', 'Auditor Gubernamental: Acceso exclusivo de sólo lectura a expedientes reservados y logs de auditoría.']
        ];

        for (const [id, name, desc] of rolesData) {
            await connection.query('INSERT INTO roles (id, name, description) VALUES (?, ?, ?)', [id, name, desc]);
        }
        console.log('✅ Roles sembrados.');

        // 6. Sembrado de Permisos
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

        for (const [id, name, desc] of permsData) {
            await connection.query('INSERT INTO permissions (id, name, description) VALUES (?, ?, ?)', [id, name, desc]);
        }
        console.log('✅ Permisos sembrados.');

        // 7. Mapeo de Permisos a Roles
        for (const [permId] of permsData) {
            await connection.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['admin', permId]);
        }

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
        for (const permId of userPerms) {
            await connection.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['user', permId]);
        }

        await connection.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['firmante', 'doc_sign_reserved']);
        console.log('✅ Permisos vinculados a los roles.');

        // 8. Mapeo de Usuarios a Roles
        await connection.query("INSERT INTO user_roles (user_id, role_id) VALUES ('u1', 'admin')");
        await connection.query("INSERT INTO user_roles (user_id, role_id) VALUES ('u2', 'user')");
        await connection.query("INSERT INTO user_roles (user_id, role_id) VALUES ('u3', 'user')");
        await connection.query("INSERT INTO user_roles (user_id, role_id) VALUES ('u4', 'user')");
        console.log('✅ Usuarios asignados a sus roles.');

        // 9. Sembrado de Tipos Documentales
        await connection.query(`
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
        console.log('✅ Tipos documentales sembrados.');

        // Volvemos a activar las restricciones de seguridad
        await connection.query('SET FOREIGN_KEY_CHECKS = 1;');

        console.log('🎉 ¡Restablecimiento completo! La base de datos ha quedado en su estado inicial semilla.');
        process.exit(0);
    } catch (error) {
        if (connection) {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
        }
        console.error('❌ Ocurrió un error al restablecer la base de datos:', error);
        process.exit(1);
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

resetData();