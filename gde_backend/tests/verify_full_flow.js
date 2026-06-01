// tests/verify_full_flow.js
const pool = require('../config/db');

async function run() {
    console.log('🧪 Iniciando verificación del flujo completo de documento...');
    const backendUrl = 'http://localhost:3000/api';

    try {
        // 1. Login de Juan (u2)
        console.log('🔑 Obteniendo credenciales de Juan (u2)...');
        const resJuan = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'juan@gde.com', password: '123' })
        });
        const dataJuan = await resJuan.json();
        const tokenJuan = dataJuan.token;

        if (!tokenJuan) {
            console.error('❌ No se pudo obtener el token de Juan.');
            process.exit(1);
        }

        // 2. Login de Carlos Lopez (u4)
        console.log('🔑 Obteniendo credenciales de Carlos (u4)...');
        const resCarlos = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'carlos@gde.com', password: '123' })
        });
        const dataCarlos = await resCarlos.json();
        const tokenCarlos = dataCarlos.token;

        // 3. Crear borrador como Juan (u2)
        const docId = `doc_flow_${Date.now()}`;
        console.log(`📄 Creando borrador ${docId} como Juan...`);
        const createRes = await fetch(`${backendUrl}/docs/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenJuan}`
            },
            body: JSON.stringify({
                id: docId,
                docType: 'Nota',
                subject: 'Borrador Flujo Test',
                content: '<p>Cuerpo inicial.</p>',
                creatorId: 'u2',
                currentOwnerId: 'u2',
                status: 'Borrador',
                owners: ['u2'],
                recipients: ['u4'], // Enviado a Carlos
                areaId: 'a1'
            })
        });

        if (!createRes.ok) {
            console.error('❌ Error al crear el documento:', createRes.status, await createRes.json());
            process.exit(1);
        }
        console.log('✅ Documento creado con éxito.');

        // 4. Juan edita el cuerpo y envía a revisar a Carlos (u4)
        console.log('📝 Juan edita el cuerpo en el autoguardado...');
        const autoSaveRes = await fetch(`${backendUrl}/docs/update/${docId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenJuan}`
            },
            body: JSON.stringify({
                item: {
                    id: docId,
                    docType: 'Nota',
                    subject: 'Borrador Flujo Test',
                    content: '<p>Cuerpo editado por Juan.</p>', // Cuerpo editado
                    creatorId: 'u2',
                    currentOwnerId: 'u2',
                    status: 'Borrador',
                    owners: ['u2'],
                    recipients: ['u4'],
                    areaId: 'a1'
                }
            })
        });

        if (!autoSaveRes.ok) {
            console.error('❌ Error en el autoguardado de Juan:', autoSaveRes.status, await autoSaveRes.json());
            process.exit(1);
        }
        console.log('✅ Autoguardado de Juan completado (200).');

        // 5. Juan lo envía a revisar a Carlos (u4)
        console.log('✉️ Juan envía a revisar a Carlos (u4)...');
        const sendReviewRes = await fetch(`${backendUrl}/docs/update/${docId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenJuan}`
            },
            body: JSON.stringify({
                item: {
                    id: docId,
                    docType: 'Nota',
                    subject: 'Borrador Flujo Test',
                    content: '<p>Cuerpo editado por Juan.</p>',
                    creatorId: 'u2',
                    currentOwnerId: 'u4', // Carlos es el nuevo dueño
                    status: 'Borrador',
                    owners: ['u2'],
                    recipients: ['u4'],
                    areaId: 'a3' // Área de Carlos
                },
                historyEntry: {
                    userId: 'u2',
                    action: 'Enviado a Revisar a Carlos Lopez',
                    notes: 'Favor de revisar el cuerpo.'
                }
            })
        });

        if (!sendReviewRes.ok) {
            console.error('❌ Error al enviar a revisar:', sendReviewRes.status, await sendReviewRes.json());
            process.exit(1);
        }
        console.log('✅ Documento enviado a revisar con éxito (200).');

        // 6. Carlos (u4) lo abre, edita el cuerpo y hace click en "Enviar a Firmar" (lo cual dispara autoSaveDraft)
        console.log('📝 Carlos (u4) simula autoguardado al hacer click en Enviar a Firmar...');
        const autoSaveCarlosRes = await fetch(`${backendUrl}/docs/update/${docId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenCarlos}`
            },
            body: JSON.stringify({
                item: {
                    id: docId,
                    docType: 'Nota',
                    subject: 'Borrador Flujo Test (Revisado por Carlos)',
                    content: '<p>Cuerpo editado por Juan. Carlos agrega cambios.</p>', // Cuerpo con cambios de Carlos
                    creatorId: 'u2',
                    currentOwnerId: 'u4',
                    status: 'Borrador',
                    owners: ['u2'],
                    recipients: ['u4'],
                    areaId: 'a3'
                }
            })
        });

        console.log('Código HTTP del autoguardado de Carlos:', autoSaveCarlosRes.status);
        const autoSaveCarlosData = await autoSaveCarlosRes.json();
        console.log('Respuesta del servidor para Carlos:', autoSaveCarlosData);

        if (autoSaveCarlosRes.ok) {
            console.log('✅ Carlos pudo realizar el autoguardado.');
        } else {
            console.error('❌ Carlos recibió 403 Forbidden o error.');
        }

        // Limpieza final
        await pool.query('DELETE FROM documents WHERE id = ?', [docId]);
        await pool.query('DELETE FROM history WHERE item_id = ?', [docId]);

    } catch (e) {
        console.error('❌ Error crítico en la prueba:', e.message);
    } finally {
        pool.end();
    }
}

run();
