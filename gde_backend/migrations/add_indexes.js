// migrations/add_indexes.js
// Script de migración: Agrega índices para soportar 2000+ usuarios concurrentes
// Ejecutar una sola vez: node migrations/add_indexes.js
const pool = require('../config/db');

async function addIndexes() {
    console.log('🔧 Agregando índices para optimización de consultas...\n');

    const indexes = [
        // Tabla HISTORY — la más consultada por dashboard y documentos
        {
            name: 'idx_history_item',
            sql: 'CREATE INDEX idx_history_item ON history (item_id, item_type)',
            desc: 'Búsqueda rápida de historial por documento/expediente'
        },
        {
            name: 'idx_history_created',
            sql: 'CREATE INDEX idx_history_created ON history (created_at)',
            desc: 'Ordenamiento y filtrado por fecha'
        },
        {
            name: 'idx_history_action_type_created',
            sql: 'CREATE INDEX idx_history_action_type_created ON history (item_type, action, created_at)',
            desc: 'Queries del dashboard (firmas por hora, descargas, etc.)'
        },
        {
            name: 'idx_history_user',
            sql: 'CREATE INDEX idx_history_user ON history (user_id)',
            desc: 'Actividad por usuario'
        },

        // Tabla DOCUMENTS
        {
            name: 'idx_docs_status',
            sql: 'CREATE INDEX idx_docs_status ON documents (status)',
            desc: 'Filtrado por estado (Borrador, Firmado, etc.)'
        },
        {
            name: 'idx_docs_creator',
            sql: 'CREATE INDEX idx_docs_creator ON documents (creator_id)',
            desc: 'Documentos por creador'
        },
        {
            name: 'idx_docs_owner',
            sql: 'CREATE INDEX idx_docs_owner ON documents (current_owner_id)',
            desc: 'Documentos por propietario actual'
        },
        {
            name: 'idx_docs_area',
            sql: 'CREATE INDEX idx_docs_area ON documents (area_id)',
            desc: 'Documentos por área'
        },
        {
            name: 'idx_docs_created',
            sql: 'CREATE INDEX idx_docs_created ON documents (created_at)',
            desc: 'Ordenamiento por fecha de creación'
        },

        // Tabla NOTIFICATIONS
        {
            name: 'idx_notif_user_read',
            sql: 'CREATE INDEX idx_notif_user_read ON notifications (user_id, is_read)',
            desc: 'Notificaciones no leídas por usuario'
        },
        {
            name: 'idx_notif_created',
            sql: 'CREATE INDEX idx_notif_created ON notifications (created_at)',
            desc: 'Ordenamiento de notificaciones por fecha'
        },

        // Tabla EXPEDIENTES
        {
            name: 'idx_exp_status',
            sql: 'CREATE INDEX idx_exp_status ON expedientes (status)',
            desc: 'Filtrado de expedientes por estado'
        },
        {
            name: 'idx_exp_owner',
            sql: 'CREATE INDEX idx_exp_owner ON expedientes (current_owner_id)',
            desc: 'Expedientes por propietario actual'
        },
        {
            name: 'idx_exp_creator',
            sql: 'CREATE INDEX idx_exp_creator ON expedientes (creator_id)',
            desc: 'Expedientes por creador'
        },

        // Tabla USERS
        {
            name: 'idx_users_area',
            sql: 'CREATE INDEX idx_users_area ON users (area_id)',
            desc: 'Usuarios por área'
        }
    ];

    let created = 0;
    let skipped = 0;

    for (const idx of indexes) {
        try {
            await pool.query(idx.sql);
            console.log(`  ✅ ${idx.name} — ${idx.desc}`);
            created++;
        } catch (error) {
            if (error.code === 'ER_DUP_KEYNAME') {
                console.log(`  ⏭️  ${idx.name} — Ya existe, omitido`);
                skipped++;
            } else {
                console.error(`  ❌ ${idx.name} — Error: ${error.message}`);
            }
        }
    }

    console.log(`\n📊 Resultado: ${created} creados, ${skipped} ya existían`);
    console.log('✅ Migración de índices completada.');
    process.exit(0);
}

addIndexes().catch(err => {
    console.error('Error fatal en migración:', err);
    process.exit(1);
});
