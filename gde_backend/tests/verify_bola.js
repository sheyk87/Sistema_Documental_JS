// tests/verify_bola.js
// Script de prueba de integración para validar la Fase 1 (Seguridad BOLA/IDOR e Integridad)

const pool = require('../config/db');

async function runVerification() {
    console.log('🧪 Iniciando verificación de seguridad de la Fase 1...');
    let passed = true;

    try {
        // 1. Obtener tokens de prueba
        // En un entorno local, el backend corre en http://localhost:3000
        const backendUrl = 'http://localhost:3000/api';

        console.log('🔑 Obteniendo credenciales de Juan (User 1)...');
        const resJuan = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'juan@gde.com', password: '123' })
        });
        const dataJuan = await resJuan.json();
        const tokenJuan = dataJuan.token;

        if (!tokenJuan) {
            console.error('❌ No se pudo obtener el token de Juan. Asegúrese de que el backend esté arriba.');
            process.exit(1);
        }

        console.log('🔑 Obteniendo credenciales de María (User 2)...');
        const resMaria = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'maria@gde.com', password: '123' })
        });
        const dataMaria = await resMaria.json();
        const tokenMaria = dataMaria.token;

        // 2. Crear documento borrador con Juan (User 1)
        console.log('📄 Creando borrador de prueba para Juan...');
        const docId = `doc_test_${Date.now()}`;
        const createRes = await fetch(`${backendUrl}/docs/create`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenJuan}`
            },
            body: JSON.stringify({
                id: docId,
                docType: 'Nota',
                subject: 'Borrador Confidencial de Juan',
                content: '<p>Este contenido es secreto.</p>',
                creatorId: 'u2', // juan
                currentOwnerId: 'u2',
                status: 'Borrador',
                owners: ['u2'],
                recipients: ['a1'],
                areaId: 'a1'
            })
        });

        if (!createRes.ok) {
            console.error('❌ Error al crear el borrador de prueba.');
            process.exit(1);
        }

        // 3. INTENTO BOLA/IDOR: María intenta leer el borrador de Juan
        console.log('🚨 ATAQUE BOLA: María (User 2) intenta leer el borrador confidencial de Juan...');
        const attackRes = await fetch(`${backendUrl}/docs/${docId}/content`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${tokenMaria}` }
        });

        if (attackRes.status === 403) {
            console.log('✅ A01 PROTEGIDO: Acceso denegado con HTTP 403 (BOLA Mitigado).');
        } else {
            console.error(`❌ VULNERABLE: María pudo leer el documento. HTTP Status: ${attackRes.status}`);
            passed = false;
        }

        // 4. Limpieza del borrador de prueba (Juan lo elimina)
        console.log('🧹 Eliminando borrador de prueba...');
        await fetch(`${backendUrl}/docs/delete/${docId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenJuan}` }
        });

        // 5. REGLE CRÍTICA DE EXPEDIENTES: Impedir desvinculación de fojas selladas
        console.log('📂 Validando integridad de fojas selladas en Expedientes...');
        // Creamos un expediente de prueba en la BD directamente para no ensuciar el flujo
        const expId = `exp_test_${Date.now()}`;
        const testDocId = `doc_sealed_${Date.now()}`;
        
        await pool.query(
            `INSERT INTO expedientes (id, number, subject, creator_id, current_owner_id, status, is_public, auth_areas, auth_users, linked_docs, sealed_docs) 
             VALUES (?, 'EX-2026-TEST', 'Expediente Prueba Integridad', 'u2', 'u2', 'En trámite', 1, '[]', '[]', ?, ?)`,
            [expId, JSON.stringify([testDocId]), JSON.stringify([testDocId])] // Vinculado y Sellado
        );

        // Juan (dueño) intenta actualizar el expediente removiendo el documento sellado (linkedDocs vacío)
        console.log('🚨 ATAQUE INTEGRIDAD: Juan intenta desvincular la foja sellada...');
        const desvincRes = await fetch(`${backendUrl}/exps/update/${expId}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenJuan}`
            },
            body: JSON.stringify({
                item: {
                    id: expId,
                    currentOwnerId: 'u2',
                    status: 'En trámite',
                    authAreas: [],
                    authUsers: [],
                    linkedDocs: [], // Intentamos remover el documento testDocId
                    sealedDocs: [testDocId],
                    areaId: 'a1'
                },
                historyEntry: {
                    userId: 'u2',
                    action: 'Intento Desvincular',
                    notes: 'Debería fallar'
                }
            })
        });

        if (desvincRes.status === 403) {
            console.log('✅ REGLA CUMPLIDA: El sistema bloqueó la desvinculación de la foja sellada con HTTP 403.');
        } else {
            console.error(`❌ INTEGRIDAD VIOLADA: El sistema permitió remover la foja sellada. HTTP Status: ${desvincRes.status}`);
            passed = false;
        }

        // Limpieza de expediente de prueba en BD
        await pool.query('DELETE FROM expedientes WHERE id = ?', [expId]);

        if (passed) {
            console.log('🎉 🎉 TODAS LAS PRUEBAS DE LA FASE 1 PASARON CON ÉXITO! El backend es seguro.');
            process.exit(0);
        } else {
            console.error('❌ ALGUNAS PRUEBAS FALLARON.');
            process.exit(1);
        }

    } catch (e) {
        console.error('❌ Error de conexión o ejecución de la prueba:', e.message);
        process.exit(1);
    }
}

runVerification();
