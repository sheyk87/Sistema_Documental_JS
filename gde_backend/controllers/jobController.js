// controllers/jobController.js
// Endpoint para consultar el estado de jobs en BullMQ
// OWASP A01: Solo usuarios autenticados pueden consultar. Cola de emails NO expuesta.
const { signatureQueue } = require('../config/queues');

// Whitelist de colas consultables — OWASP A01: no exponer colas internas
const ALLOWED_QUEUES = {
    'signature': signatureQueue,
};

exports.getJobStatus = async (req, res) => {
    const { queueName, jobId } = req.params;

    // Validar que la cola es consultable
    const queue = ALLOWED_QUEUES[queueName];
    if (!queue) {
        return res.status(400).json({ message: 'Cola no válida' });
    }

    try {
        const job = await queue.getJob(jobId);
        
        if (!job) {
            return res.status(404).json({ message: 'Job no encontrado' });
        }

        const state = await job.getState();
        const progress = job.progress || 0;
        const result = job.returnvalue || null;
        const failReason = job.failedReason || null;

        res.json({
            jobId: job.id,
            state,       // 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
            progress,    // 0-100 (reportado por el worker)
            result,      // Datos de resultado (solo si completado)
            failReason,  // Mensaje de error (solo si falló)
        });

    } catch (error) {
        console.error('Error consultando job:', error);
        res.status(500).json({ message: 'Error al consultar estado del trabajo' });
    }
};
