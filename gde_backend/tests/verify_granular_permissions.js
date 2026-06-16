// tests/verify_granular_permissions.js
const pool = require('../config/db');
const bcrypt = require('bcrypt');

const originalFetch = global.fetch;
global.fetch = function(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['x-stress-bypass'] = 'STRESS_BYPASS_TOKEN_2026';
    return originalFetch(url, options);
};

async function runTests() {
    console.log("=== INICIANDO PRUEBA DE INTEGRACIÓN: VERIFICACIÓN DE PERMISOS GRANULARES ===");
    const backendUrl = 'http://localhost:3000/api';

    try {
        // 1. Preparar en base de datos el rol 'Test' y el usuario 'Test'
        console.log('🧹 Inicializando rol y usuario "Test" en la BD...');
        
        // Crear rol 'Test' si no existe
        await pool.query('INSERT IGNORE INTO roles (id, name, description) VALUES ("Test", "Rol de Test", "Rol limitado para pruebas de permisos")');
        
        // Limpiar permisos previos del rol 'Test' y asignarle ÚNICAMENTE 'doc_create' y 'doc_edit'
        await pool.query('DELETE FROM role_permissions WHERE role_id = "Test"');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "doc_create")');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "doc_edit")');

        // Crear/Restaurar usuario 'Test' (id: u_test)
        const hashPass = await bcrypt.hash('S3qpkzm1!', 10);
        // Limpiar todas las relaciones del usuario 'u_test' para evitar restricciones de clave foránea
        await pool.query('DELETE FROM notifications WHERE user_id = "u_test" OR sender_id = "u_test"');
        await pool.query('DELETE FROM history WHERE user_id = "u_test"');
        await pool.query('DELETE FROM expediente_movements WHERE sender_id = "u_test" OR receiver_id = "u_test" OR expediente_id IN (SELECT id FROM expedientes WHERE creator_id = "u_test" OR current_owner_id = "u_test")');
        await pool.query('DELETE FROM expedientes WHERE creator_id = "u_test" OR current_owner_id = "u_test"');
        await pool.query('DELETE FROM documents WHERE creator_id = "u_test" OR current_owner_id = "u_test"');
        await pool.query('DELETE FROM user_roles WHERE user_id = "u_test"');
        await pool.query('DELETE FROM users WHERE id = "u_test"');
        await pool.query(`
            INSERT INTO users (id, name, email, password, area_id, role, status, must_change_password) 
            VALUES ("u_test", "Test", "test@gde.com", ?, "a1", "user", "active", 0)
        `, [hashPass]);
        await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ("u_test", "Test")');

        console.log('✅ Rol y usuario Test creados/configurados con contraseña: S3qpkzm1!');

        // 2. Iniciar sesión como usuario 'Test' para obtener su token
        console.log('🔑 Iniciando sesión como usuario Test...');
        const resLogin = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'test@gde.com', password: 'S3qpkzm1!' })
        });
        const loginData = await resLogin.json();
        const testToken = loginData.token;

        if (!testToken) {
            throw new Error("No se pudo iniciar sesión como usuario Test.");
        }
        console.log('✅ Sesión iniciada con éxito.');

        // Crear un documento borrador y un documento firmado para probar las reglas de lectura condicional
        console.log('📝 Creando documentos de prueba (Borrador y Firmado)...');
        const docDraftId = 'doc_test_draft_' + Date.now();
        await pool.query(`
            INSERT INTO documents (id, number, subject, content, creator_id, current_owner_id, status, is_public, doc_type)
            VALUES (?, 'DOC-DRAFT-123', 'Documento Borrador', 'Contenido borrador', 'u_test', 'u_test', 'Borrador', 1, 'SOLI')
        `, [docDraftId]);

        const docSignedId = 'doc_test_signed_' + Date.now();
        await pool.query(`
            INSERT INTO documents (id, number, subject, content, creator_id, current_owner_id, status, is_public, doc_type)
            VALUES (?, 'DOC-SIGNED-123', 'Documento Firmado', 'Contenido firmado', 'u_test', 'u_test', 'Firmado', 1, 'SOLI')
        `, [docSignedId]);

        const expId = 'exp_test_' + Date.now();
        await pool.query(`
            INSERT INTO expedientes (id, number, subject, creator_id, current_owner_id, status, is_public)
            VALUES (?, 'EXP-TEST-123', 'Expediente Prueba Permisos', 'u_test', 'u_test', 'iniciado', 1)
        `, [expId]);

        // --- PRUEBA 1a: Intentar consultar borrador con doc_edit pero sin doc_read ---
        console.log('\n🔍 Prueba 1a: Consultar borrador teniendo doc_edit...');
        const resReadDraft = await fetch(`${backendUrl}/docs/${docDraftId}/content`, {
            headers: { 'Authorization': `Bearer ${testToken}` }
        });
        console.log(`Response Status: ${resReadDraft.status}`);
        if (resReadDraft.status === 200) {
            console.log("✅ Prueba 1a exitosa: El backend permitió leer el borrador usando el permiso doc_edit.");
        } else {
            throw new Error(`Fallo en Prueba 1a: Se esperaba 200, se obtuvo ${resReadDraft.status}`);
        }

        // --- PRUEBA 1b: Intentar consultar firmado sin doc_read (teniendo doc_edit) ---
        console.log('\n🚫 Prueba 1b: Consultar documento firmado sin doc_read (teniendo doc_edit)...');
        const resReadSignedFail = await fetch(`${backendUrl}/docs/${docSignedId}/content`, {
            headers: { 'Authorization': `Bearer ${testToken}` }
        });
        console.log(`Response Status: ${resReadSignedFail.status}`);
        if (resReadSignedFail.status === 403) {
            console.log("✅ Prueba 1b exitosa: El backend bloqueó el acceso al documento firmado por falta de doc_read.");
        } else {
            throw new Error(`Fallo en Prueba 1b: Se esperaba 403, se obtuvo ${resReadSignedFail.status}`);
        }

        // --- ASIGNAR ROL 'Test' CON 'doc_read' PERO SIN 'doc_edit' ---
        console.log('\n🔄 Cambiando permisos del rol Test (quitando doc_edit, agregando doc_read)...');
        await pool.query('DELETE FROM role_permissions WHERE role_id = "Test"');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "doc_read")');

        // --- PRUEBA 2a: Intentar consultar firmado con doc_read (sin doc_edit) ---
        console.log('\n🔍 Prueba 2a: Consultar firmado teniendo doc_read...');
        const resReadSignedOk = await fetch(`${backendUrl}/docs/${docSignedId}/content`, {
            headers: { 'Authorization': `Bearer ${testToken}` }
        });
        console.log(`Response Status: ${resReadSignedOk.status}`);
        if (resReadSignedOk.status === 200) {
            console.log("✅ Prueba 2a exitosa: El backend permitió leer el firmado usando el permiso doc_read.");
        } else {
            throw new Error(`Fallo en Prueba 2a: Se esperaba 200, se obtuvo ${resReadSignedOk.status}`);
        }

        // --- PRUEBA 2b: Intentar consultar borrador sin doc_edit (teniendo doc_read) ---
        console.log('\n🚫 Prueba 2b: Consultar borrador sin doc_edit (teniendo doc_read)...');
        const resReadDraftFail = await fetch(`${backendUrl}/docs/${docDraftId}/content`, {
            headers: { 'Authorization': `Bearer ${testToken}` }
        });
        console.log(`Response Status: ${resReadDraftFail.status}`);
        if (resReadDraftFail.status === 403) {
            console.log("✅ Prueba 2b exitosa: El backend bloqueó la consulta del borrador por falta de doc_edit.");
        } else {
            throw new Error(`Fallo en Prueba 2b: Se esperaba 403, se obtuvo ${resReadDraftFail.status}`);
        }

        // --- PRUEBA 3: Intentar realizar pase de expediente sin exp_pase o exp_read ---
        console.log('\n🚫 Prueba 3: Intentar realizar pase de expediente sin exp_pase o exp_read...');
        const resPaseExp = await fetch(`${backendUrl}/exps/${expId}/pase`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ receiverId: 'u2', notes: 'Pase de test' })
        });
        console.log(`Response Status: ${resPaseExp.status}`);
        if (resPaseExp.status === 403) {
            console.log("✅ Prueba 3 exitosa: El backend bloqueó el pase.");
        } else {
            throw new Error(`Fallo en Prueba 3: Se esperaba 403, se obtuvo ${resPaseExp.status}`);
        }

        // --- PRUEBA 4: Intentar operaciones administrativas sin permisos de administración ---
        console.log('\n🚫 Prueba 4: Intentar crear un rol administrativo sin admin_manage_roles...');
        const resCreateRole = await fetch(`${backendUrl}/roles/create`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: 'bad_role', name: 'Malo', permissions: [] })
        });
        console.log(`Response Status: ${resCreateRole.status}`);
        if (resCreateRole.status === 403) {
            console.log("✅ Prueba 4 exitosa: El backend bloqueó la creación de roles.");
        } else {
            throw new Error(`Fallo en Prueba 4: Se esperaba 403, se obtuvo ${resCreateRole.status}`);
        }

        // --- PRUEBA 5: Acciones sobre documento firmado sin permisos específicos (derivar, archivar, anular) ---
        console.log('\n🚫 Prueba 5a: Intentar derivar documento firmado sin doc_derive...');
        const resDeriveSignedFail = await fetch(`${backendUrl}/docs/update/${docSignedId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ item: { id: docSignedId, currentOwnerId: 'u2' } })
        });
        console.log(`Response Status: ${resDeriveSignedFail.status}`);
        if (resDeriveSignedFail.status === 403) {
            console.log("✅ Prueba 5a exitosa: Bloqueó derivación sin permiso.");
        } else {
            throw new Error(`Fallo en Prueba 5a: Se esperaba 403, se obtuvo ${resDeriveSignedFail.status}`);
        }

        console.log('\n🚫 Prueba 5b: Intentar archivar documento firmado sin doc_archive...');
        const resArchiveSignedFail = await fetch(`${backendUrl}/docs/update/${docSignedId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ item: { id: docSignedId, status: 'Archivado' } })
        });
        console.log(`Response Status: ${resArchiveSignedFail.status}`);
        if (resArchiveSignedFail.status === 403) {
            console.log("✅ Prueba 5b exitosa: Bloqueó archivo sin permiso.");
        } else {
            throw new Error(`Fallo en Prueba 5b: Se esperaba 403, se obtuvo ${resArchiveSignedFail.status}`);
        }

        console.log('\n🚫 Prueba 5c: Intentar anular documento firmado sin doc_annul...');
        const resAnnulSignedFail = await fetch(`${backendUrl}/docs/update/${docSignedId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ item: { id: docSignedId, status: 'Anulado' } })
        });
        console.log(`Response Status: ${resAnnulSignedFail.status}`);
        if (resAnnulSignedFail.status === 403) {
            console.log("✅ Prueba 5c exitosa: Bloqueó anulación sin permiso.");
        } else {
            throw new Error(`Fallo en Prueba 5c: Se esperaba 403, se obtuvo ${resAnnulSignedFail.status}`);
        }

        // --- PRUEBA 6: Documentos Reservados ---
        console.log('\n📝 Creando documento reservado firmado...');
        const docReservedSignedId = 'doc_test_res_signed_' + Date.now();
        await pool.query(`
            INSERT INTO documents (id, number, subject, content, creator_id, current_owner_id, status, is_public, doc_type, auth_users)
            VALUES (?, 'DOC-RES-SIGNED-123', 'Doc Reservado Firmado', 'Contenido reservado', 'u_test', 'u_test', 'Firmado', 0, 'SOLI', '["u_test"]')
        `, [docReservedSignedId]);

        console.log('\n🚫 Prueba 6a: Intentar leer documento reservado firmado teniendo doc_read pero no doc_read_reserved...');
        const resReadResSignedFail = await fetch(`${backendUrl}/docs/${docReservedSignedId}/content`, {
            headers: { 'Authorization': `Bearer ${testToken}` }
        });
        console.log(`Response Status: ${resReadResSignedFail.status}`);
        if (resReadResSignedFail.status === 403) {
            console.log("✅ Prueba 6a exitosa: Bloqueó lectura de reservado firmado.");
        } else {
            throw new Error(`Fallo en Prueba 6a: Se esperaba 403, se obtuvo ${resReadResSignedFail.status}`);
        }

        console.log('\n🔄 Asignando doc_read_reserved al rol Test...');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "doc_read_reserved")');

        console.log('\n🔍 Prueba 6b: Leer documento reservado firmado con doc_read_reserved...');
        const resReadResSignedOk = await fetch(`${backendUrl}/docs/${docReservedSignedId}/content`, {
            headers: { 'Authorization': `Bearer ${testToken}` }
        });
        console.log(`Response Status: ${resReadResSignedOk.status}`);
        if (resReadResSignedOk.status === 200) {
            console.log("✅ Prueba 6b exitosa: Permitió lectura de reservado firmado.");
        } else {
            throw new Error(`Fallo en Prueba 6b: Se esperaba 200, se obtuvo ${resReadResSignedOk.status}`);
        }

        console.log('\n🚫 Prueba 6c: Intentar cambiar permisos de visualización sin doc_change_reserved_perms...');
        const resChangePermsFail = await fetch(`${backendUrl}/docs/update/${docReservedSignedId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                item: {
                    id: docReservedSignedId,
                    subject: 'Doc Reservado Firmado',
                    content: 'Contenido reservado',
                    status: 'Firmado',
                    currentOwnerId: 'u_test',
                    isPublic: false,
                    authUsers: ['u_test', 'u2'],
                    authAreas: []
                }
            })
        });
        console.log(`Response Status: ${resChangePermsFail.status}`);
        if (resChangePermsFail.status === 403) {
            console.log("✅ Prueba 6c exitosa: Bloqueó modificación de permisos sin autorización.");
        } else {
            throw new Error(`Fallo en Prueba 6c: Se esperaba 403, se obtuvo ${resChangePermsFail.status}`);
        }

        console.log('\n🔄 Asignando doc_change_reserved_perms al rol Test...');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "doc_change_reserved_perms")');

        console.log('\n🔍 Prueba 6d: Cambiar permisos de visualización con doc_change_reserved_perms...');
        const resChangePermsOk = await fetch(`${backendUrl}/docs/update/${docReservedSignedId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                item: {
                    id: docReservedSignedId,
                    subject: 'Doc Reservado Firmado',
                    content: 'Contenido reservado',
                    status: 'Firmado',
                    currentOwnerId: 'u_test',
                    isPublic: false,
                    authUsers: ['u_test', 'u2'],
                    authAreas: []
                }
            })
        });
        console.log(`Response Status: ${resChangePermsOk.status}`);
        if (resChangePermsOk.status === 200) {
            console.log("✅ Prueba 6d exitosa: Permitió cambiar permisos.");
        } else {
            throw new Error(`Fallo en Prueba 6d: Se esperaba 200, se obtuvo ${resChangePermsOk.status}`);
        }

        // --- PRUEBA 7: CONTROL DE ADJUNTOS (doc_attach) ---
        console.log('\n🚫 Prueba 7a: Intentar subir un adjunto sin doc_attach...');
        await pool.query('DELETE FROM role_permissions WHERE role_id = "Test"');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "doc_edit")');
        
        const testBlob = new Blob(['test content'], { type: 'text/plain' });
        const form = new FormData();
        form.append('file', testBlob, 'test.txt');

        const resAttachFail = await fetch(`${backendUrl}/docs/${docDraftId}/attach`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${testToken}` },
            body: form
        });
        console.log(`Response Status: ${resAttachFail.status}`);
        if (resAttachFail.status === 403) {
            console.log("✅ Prueba 7a exitosa: Bloqueó subida de adjunto sin doc_attach.");
        } else {
            throw new Error(`Fallo en Prueba 7a: Se esperaba 403, se obtuvo ${resAttachFail.status}`);
        }

        console.log('\n🔄 Asignando doc_attach al rol Test...');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "doc_attach")');

        const formOk = new FormData();
        formOk.append('file', testBlob, 'test.txt');
        const resAttachOk = await fetch(`${backendUrl}/docs/${docDraftId}/attach`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${testToken}` },
            body: formOk
        });
        console.log(`Response Status: ${resAttachOk.status}`);
        if (resAttachOk.status === 200 || resAttachOk.status === 201) {
            console.log("✅ Prueba 7b exitosa: Permitió subir adjunto con doc_attach.");
        } else {
            throw new Error(`Fallo en Prueba 7b: Se esperaba 200/201, se obtuvo ${resAttachOk.status}`);
        }

        // --- PRUEBA 8: ENVIAR A FIRMAR / REVISAR (doc_send_sign) ---
        console.log('\n🚫 Prueba 8a: Intentar enviar a firmar (cambiar status a Firmandose) sin doc_send_sign...');
        await pool.query('DELETE FROM role_permissions WHERE role_id = "Test"');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "doc_edit")');

        const resSendSignFail = await fetch(`${backendUrl}/docs/update/${docDraftId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                item: {
                    id: docDraftId,
                    subject: 'Documento Borrador',
                    content: 'Contenido borrador',
                    status: 'Firmandose',
                    currentOwnerId: 'u_test',
                    isPublic: true,
                    owners: ['u_test'],
                    recipients: [],
                    signedBy: [],
                    relatedDocs: [],
                    signatories: ['u_test'],
                    number: 'DOC-DRAFT-123',
                    areaId: 'a1',
                    authAreas: [],
                    authUsers: []
                }
            })
        });
        console.log(`Response Status: ${resSendSignFail.status}`);
        if (resSendSignFail.status === 403) {
            console.log("✅ Prueba 8a exitosa: Bloqueó enviar a firmar sin doc_send_sign.");
        } else {
            throw new Error(`Fallo en Prueba 8a: Se esperaba 403, se obtuvo ${resSendSignFail.status}`);
        }

        console.log('\n🔄 Asignando doc_send_sign al rol Test...');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "doc_send_sign")');

        const resSendSignOk = await fetch(`${backendUrl}/docs/update/${docDraftId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                item: {
                    id: docDraftId,
                    subject: 'Documento Borrador',
                    content: 'Contenido borrador',
                    status: 'Firmandose',
                    currentOwnerId: 'u_test',
                    isPublic: true,
                    owners: ['u_test'],
                    recipients: [],
                    signedBy: [],
                    relatedDocs: [],
                    signatories: ['u_test'],
                    number: 'DOC-DRAFT-123',
                    areaId: 'a1',
                    authAreas: [],
                    authUsers: []
                }
            })
        });
        console.log(`Response Status: ${resSendSignOk.status}`);
        if (resSendSignOk.status === 200) {
            console.log("✅ Prueba 8b exitosa: Permitió enviar a firmar con doc_send_sign.");
        } else {
            throw new Error(`Fallo en Prueba 8b: Se esperaba 200, se obtuvo ${resSendSignOk.status}`);
        }

        // --- PRUEBA 9: DESARCHIVAR (doc_unarchive) ---
        console.log('\n📝 Creando documento Archivado...');
        const docArchivedId = 'doc_test_archived_' + Date.now();
        await pool.query(`
            INSERT INTO documents (id, number, subject, content, creator_id, current_owner_id, status, is_public, doc_type)
            VALUES (?, 'DOC-ARCH-123', 'Documento Archivado', 'Contenido archivado', 'u_test', 'u_test', 'Archivado', 1, 'SOLI')
        `, [docArchivedId]);

        console.log('\n🚫 Prueba 9a: Intentar desarchivar (pasar de Archivado a Firmado) sin doc_unarchive...');
        await pool.query('DELETE FROM role_permissions WHERE role_id = "Test"');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "doc_read")');

        const resUnarchiveFail = await fetch(`${backendUrl}/docs/update/${docArchivedId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                item: {
                    id: docArchivedId,
                    subject: 'Documento Archivado',
                    content: 'Contenido archivado',
                    status: 'Firmado',
                    currentOwnerId: 'u_test',
                    isPublic: true,
                    owners: ['u_test'],
                    recipients: [],
                    signedBy: [],
                    relatedDocs: [],
                    signatories: [],
                    number: 'DOC-ARCH-123',
                    areaId: 'a1',
                    authAreas: [],
                    authUsers: []
                }
            })
        });
        console.log(`Response Status: ${resUnarchiveFail.status}`);
        if (resUnarchiveFail.status === 403) {
            console.log("✅ Prueba 9a exitosa: Bloqueó desarchivar sin doc_unarchive.");
        } else {
            throw new Error(`Fallo en Prueba 9a: Se esperaba 403, se obtuvo ${resUnarchiveFail.status}`);
        }

        console.log('\n🔄 Asignando doc_unarchive al rol Test...');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "doc_unarchive")');

        const resUnarchiveOk = await fetch(`${backendUrl}/docs/update/${docArchivedId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                item: {
                    id: docArchivedId,
                    subject: 'Documento Archivado',
                    content: 'Contenido archivado',
                    status: 'Firmado',
                    currentOwnerId: 'u_test',
                    isPublic: true,
                    owners: ['u_test'],
                    recipients: [],
                    signedBy: [],
                    relatedDocs: [],
                    signatories: [],
                    number: 'DOC-ARCH-123',
                    areaId: 'a1',
                    authAreas: [],
                    authUsers: []
                }
            })
        });
        console.log(`Response Status: ${resUnarchiveOk.status}`);
        if (resUnarchiveOk.status === 200) {
            console.log("✅ Prueba 9b exitosa: Permitió desarchivar con doc_unarchive.");
        } else {
            throw new Error(`Fallo en Prueba 9b: Se esperaba 200, se obtuvo ${resUnarchiveOk.status}`);
        }

        // --- PRUEBA 10: DESCARGAR EXPEDIENTES (exp_download) ---
        console.log('\n🚫 Prueba 10a: Intentar descargar expediente sin exp_download...');
        await pool.query('DELETE FROM role_permissions WHERE role_id = "Test"');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "exp_read")');

        const resDownloadFail = await fetch(`${backendUrl}/exps/${expId}/download-check`, {
            headers: { 'Authorization': `Bearer ${testToken}` }
        });
        console.log(`Response Status: ${resDownloadFail.status}`);
        if (resDownloadFail.status === 403) {
            console.log("✅ Prueba 10a exitosa: Bloqueó descarga de expediente sin exp_download.");
        } else {
            throw new Error(`Fallo en Prueba 10a: Se esperaba 403, se obtuvo ${resDownloadFail.status}`);
        }

        console.log('\n🔄 Asignando exp_download al rol Test...');
        await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ("Test", "exp_download")');

        const resDownloadOk = await fetch(`${backendUrl}/exps/${expId}/download-check`, {
            headers: { 'Authorization': `Bearer ${testToken}` }
        });
        console.log(`Response Status: ${resDownloadOk.status}`);
        if (resDownloadOk.status === 200) {
            console.log("✅ Prueba 10b exitosa: Permitió descargar expediente con exp_download.");
        } else {
            throw new Error(`Fallo en Prueba 10b: Se esperaba 200, se obtuvo ${resDownloadOk.status}`);
        }

        // Limpieza de datos temporales
        console.log('\n🧹 Limpiando documentos y expedientes temporales creados para las pruebas...');
        await pool.query('DELETE FROM documents WHERE id IN (?, ?, ?, ?)', [docDraftId, docSignedId, docReservedSignedId, docArchivedId]);
        await pool.query('DELETE FROM expedientes WHERE id = ?', [expId]);
        console.log('✅ Datos de prueba limpiados de la base de datos.');

        console.log("\n=== TODAS LAS PRUEBAS DE INTEGRACIÓN PASARON CON ÉXITO ===");

    } catch (err) {
        console.error("\n❌ ERROR EN LA VERIFICACIÓN:", err.message);
        process.exit(1);
    } finally {
        pool.end();
    }
}

runTests();
