const signpdf = require('node-signpdf').default;
const { plainAddPlaceholder } = require('node-signpdf/dist/helpers');
const fsPromises = require('fs').promises;
const path = require('path');

// Cache del certificado PKCS#12 en memoria para evitar leerlo del disco en cada firma
let p12Cache = null;

async function loadCertificate() {
    if (p12Cache) return p12Cache;
    const p12Path = path.join(__dirname, '../certs/certificado.p12');
    p12Cache = await fsPromises.readFile(p12Path);
    return p12Cache;
}

exports.signPdfBuffer = async (pdfBuffer) => {
    try {
        // 1. Cargar el contenedor PKCS#12 (cacheado tras primera lectura)
        const p12Buffer = await loadCertificate();

        // 2. Inyectar el espacio reservado (ByteRange) en el PDF crudo
        const pdfWithPlaceholder = plainAddPlaceholder({
            pdfBuffer: pdfBuffer,
            reason: 'Firma Digital GDE Autorizada',
            location: 'Servidor Central',
            signatureLength: 8192, // Tamaño estándar seguro
        });

        // 3. Aplicar la firma criptográfica
        const signedPdf = signpdf.sign(pdfWithPlaceholder, p12Buffer, {
            passphrase: '' 
        });

        return signedPdf;
    } catch (error) {
        console.error("Error en la firma criptográfica:", error);
        throw error;
    }
};

// Permite invalidar la caché si se cambia el certificado en caliente
exports.clearCertCache = () => { p12Cache = null; };