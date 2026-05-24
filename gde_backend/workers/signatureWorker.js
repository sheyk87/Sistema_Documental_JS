// workers/signatureWorker.js
// Worker de BullMQ para firma criptográfica de PDFs en background
// Fase 4: Libera el thread principal de operaciones CPU-intensive (5 fases de sellado)
const { Worker } = require('bullmq');
const { connection } = require('../config/queues');
const pool = require('../config/db');
const cryptoService = require('../services/cryptoService');
const signatureService = require('../services/signatureService');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.FILE_SECRET;

// Función auxiliar: hora Argentina para MySQL
const getArgTime = () => {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const signatureWorker = new Worker('gde-signature', async (job) => {
    const { documentId, tempFilePath, docData, historyEntry } = job.data;

    await job.updateProgress(10); // Iniciando

    // --- FASE 1: CARGAR PDF BASE ---
    let pdfBuffer = await fsPromises.readFile(tempFilePath);

    // Buscamos los adjuntos en la BD
    const [rows] = await pool.query('SELECT attachments FROM documents WHERE id = ?', [documentId]);
    if (!rows || rows.length === 0) {
        throw new Error(`Documento ${documentId} no encontrado en la base de datos`);
    }
    let attachments = typeof rows[0].attachments === 'string' ? JSON.parse(rows[0].attachments) : (rows[0].attachments || []);

    await job.updateProgress(20); // PDF cargado

    // --- FASE 2: DESENCRIPTAR Y EMBEBER ADJUNTOS ---
    if (attachments.length > 0) {
        const pdfDoc = await PDFDocument.load(pdfBuffer);

        for (let att of attachments) {
            const attPath = path.join(__dirname, '../uploads', att.filename);

            let attExists = true;
            try { await fsPromises.access(attPath, fs.constants.R_OK); } catch { attExists = false; }
            if (attExists) {
                let fileBytesToEmbed;

                try {
                    // Extraemos el IV del nombre del archivo
                    const parts = att.filename.split('-');
                    const ivHex = parts[0];

                    if (ivHex.length === 32) {
                        // Está cifrado. Desciframos en memoria.
                        const iv = Buffer.from(ivHex, 'hex');
                        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
                        const encryptedData = await fsPromises.readFile(attPath);
                        fileBytesToEmbed = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
                    } else {
                        // Compatibilidad con archivos antiguos sin cifrado
                        fileBytesToEmbed = await fsPromises.readFile(attPath);
                    }
                } catch (cryptoErr) {
                    console.error(`[SignWorker] Error desencriptando anexo ${att.filename}:`, cryptoErr);
                    fileBytesToEmbed = await fsPromises.readFile(attPath);
                }

                await pdfDoc.attach(fileBytesToEmbed, att.originalname, {
                    mimeType: att.mimetype,
                    description: 'Anexo Oficial',
                    creationDate: new Date(),
                    modificationDate: new Date(),
                });
            }
        }
        pdfBuffer = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
    }

    await job.updateProgress(50); // Adjuntos embebidos

    // --- FASE 3: FIRMA CRIPTOGRÁFICA (PKCS#7) ---
    try {
        pdfBuffer = await signatureService.signPdfBuffer(pdfBuffer);
    } catch (signErr) {
        console.error("[SignWorker] Error en firma PKCS#7:", signErr);
        throw new Error("No se pudo aplicar la firma con certificado al documento.");
    }

    await job.updateProgress(70); // Firma aplicada

    // --- FASE 4: HASH, ENCRIPTACIÓN DEL PDF FINAL Y GUARDADO ---
    const pdfHash = cryptoService.calculateHash(pdfBuffer);
    const securePath = path.join(__dirname, '../uploads/secure_docs', `${documentId}.enc`);
    await cryptoService.encryptAndSave(pdfBuffer, securePath);

    // Limpieza de archivos temporales y adjuntos originales encriptados
    try { await fsPromises.unlink(tempFilePath); } catch (e) { /* ya limpio */ }
    if (attachments.length > 0) {
        for (let att of attachments) {
            const attPath = path.join(__dirname, '../uploads', att.filename);
            try { await fsPromises.unlink(attPath); } catch (e) { /* ya limpio */ }
        }
    }

    await job.updateProgress(90); // Encriptado y guardado

    // --- FASE 5: ACTUALIZAR BASE DE DATOS ---
    await pool.query(
        `UPDATE documents SET status = 'Firmado', number = ?, signed_by = ?, owners = ?, pdf_hash = ? WHERE id = ?`,
        [docData.number, JSON.stringify(docData.signedBy), JSON.stringify(docData.owners), pdfHash, documentId]
    );

    if (historyEntry) {
        await pool.query(
            'INSERT INTO history (item_id, item_type, user_id, action, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [documentId, 'documento', historyEntry.userId, historyEntry.action, historyEntry.notes, getArgTime()]
        );
    }

    await job.updateProgress(100); // Completado

    return { pdfHash, documentId };

}, {
    connection,
    concurrency: 2, // Máximo 2 firmas simultáneas (CPU-intensive)
});

signatureWorker.on('completed', (job, result) => {
    console.log(`✍️  Firma completada [Job ${job.id}]: Doc ${result.documentId} — Hash: ${result.pdfHash.substring(0, 16)}...`);
});

signatureWorker.on('failed', (job, err) => {
    console.error(`❌ Firma fallida [Job ${job?.id}]: ${err.message}`);
});

console.log('✍️  Signature Worker iniciado');

module.exports = signatureWorker;
