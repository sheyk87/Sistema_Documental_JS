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
            ['doc_create_reserved', 'Crear Documentación Reservada', 'Crear Documentación Reservada: Permite iniciar documentación y expedientes en carácter de reservado.'],
            ['doc_sign_reserved', 'Firmar Documentación Reservada', 'Firmar Documentación Reservada: Permite firmar documentos de carácter reservado, requiriendo validación 2FA.']
        ];

        for (const [id, name, desc] of permsData) {
            await connection.query('INSERT INTO permissions (id, name, description) VALUES (?, ?, ?)', [id, name, desc]);
        }
        console.log('✅ Permisos sembrados.');

        // 7. Mapeo de Permisos a Roles
        for (const [permId] of permsData) {
            await connection.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['admin', permId]);
        }

        const userPerms = ['doc_create', 'doc_read', 'doc_edit', 'doc_delete', 'doc_sign', 'exp_create', 'exp_read', 'exp_write', 'exp_pase', 'doc_create_reserved', 'doc_sign_reserved'];
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
            INSERT INTO document_types (code, name, requires_signature, allows_attachments, is_reserved) VALUES 
            ('SOLI', 'Solicitud', 1, 1, 0),
            ('SC', 'Solicitud de Compra', 1, 1, 0),
            ('GASTO', 'Solicitud de Gasto', 1, 1, 0),
            ('OC', 'Orden de Compra', 1, 1, 0),
            ('CAR', 'Carta', 1, 1, 0),
            ('ME', 'Memo', 1, 1, 0),
            ('NO', 'Nota', 1, 1, 0),
            ('NOTI', 'Notificación', 1, 1, 0),
            ('CIRC', 'Circular', 1, 1, 0),
            ('ACTA', 'Acta', 1, 1, 0),
            ('IF', 'Informe', 1, 1, 0),
            ('RESOL', 'Resolucion', 1, 1, 0),
            ('DISP', 'Disposicion', 1, 1, 0),
            ('ACTU', 'Actuacion', 1, 1, 0),
            ('DICT', 'Dictamen', 1, 1, 0),
            ('SANC', 'Sanción', 1, 1, 0),
            ('CONF', 'Acuerdo de confidencialidad', 1, 1, 0),
            ('FACT', 'Factura', 1, 1, 0),
            ('PRESUP', 'Presupuesto', 1, 1, 0),
            ('BAL', 'Balance', 1, 1, 0),
            ('IFT', 'Informes Técnico', 1, 1, 0),
            ('EVAL', 'Evaluación', 1, 1, 0),
            ('MPROC', 'Manual de procedimientos', 1, 1, 0),
            ('CCOND', 'Código de conducta', 1, 1, 0),
            ('POL', 'Política Interna', 1, 1, 0),
            ('CONT', 'Contrato', 1, 1, 0)
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