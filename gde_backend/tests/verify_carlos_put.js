// tests/verify_carlos_put.js
const pool = require('../config/db');

async function run() {
    console.log('🧪 Iniciando verificación del PUT de Carlos Lopez...');
    const backendUrl = 'http://localhost:3000/api';

    try {
        console.log('🔑 Obteniendo credenciales de Carlos Lopez (u4)...');
        const resCarlos = await fetch(`${backendUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'carlos@gde.com', password: '123' })
        });
        const dataCarlos = await resCarlos.json();
        const tokenCarlos = dataCarlos.token;

        if (!tokenCarlos) {
            console.error('❌ No se pudo obtener el token de Carlos. Asegúrese de que el backend esté arriba.');
            process.exit(1);
        }

        console.log('📄 Buscando el borrador doc_1780334707077 en la BD...');
        const [rows] = await pool.query('SELECT * FROM documents WHERE id = ?', ['doc_1780334707077']);
        if (rows.length === 0) {
            console.error('❌ El borrador doc_1780334707077 no existe en la BD. Ejecute el flujo del frontend primero o use otro ID.');
            process.exit(1);
        }
        const doc = rows[0];
        console.log('Datos en la BD:', {
            id: doc.id,
            creator_id: doc.creator_id,
            current_owner_id: doc.current_owner_id,
            status: doc.status
        });

        console.log('📝 Intentando hacer PUT como Carlos Lopez sobre el borrador...');
        const putRes = await fetch(`${backendUrl}/docs/update/${doc.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenCarlos}`
            },
            body: JSON.stringify({
                item: {
                    id: doc.id,
                    docType: doc.doc_type,
                    subject: doc.subject + ' (Editado por Carlos)',
                    content: doc.content + '<p>Modificado por Carlos.</p>',
                    creatorId: doc.creator_id,
                    currentOwnerId: doc.current_owner_id,
                    status: doc.status,
                    owners: typeof doc.owners === 'string' ? JSON.parse(doc.owners) : doc.owners,
                    recipients: typeof doc.recipients === 'string' ? JSON.parse(doc.recipients) : doc.recipients,
                    signedBy: typeof doc.signed_by === 'string' ? JSON.parse(doc.signed_by) : doc.signed_by,
                    signatories: typeof doc.signatories === 'string' ? JSON.parse(doc.signatories) : doc.signatories,
                    attachments: typeof doc.attachments === 'string' ? JSON.parse(doc.attachments) : doc.attachments,
                    relatedDocs: typeof doc.related_docs === 'string' ? JSON.parse(doc.related_docs) : doc.related_docs,
                    number: doc.number,
                    areaId: doc.area_id
                }
            })
        });

        console.log('Código HTTP de respuesta:', putRes.status);
        const putData = await putRes.json();
        console.log('Respuesta del servidor:', putData);

        if (putRes.ok) {
            console.log('✅ ¡ÉXITO! Carlos pudo realizar el PUT.');
        } else {
            console.log('❌ ¡FALLÓ! Carlos recibió un error:', putRes.status, putData.message);
        }

    } catch (e) {
        console.error('❌ Error de conexión o ejecución:', e.message);
    } finally {
        pool.end();
    }
}

run();
