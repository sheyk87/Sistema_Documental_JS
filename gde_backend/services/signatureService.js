const signpdf = require('node-signpdf').default;
const { plainAddPlaceholder } = require('node-signpdf/dist/helpers');
const fs = require('fs');
const path = require('path');

exports.signPdfBuffer = (pdfBuffer) => {
    try {
        // 1. Cargar el contenedor PKCS#12
        const p12Path = path.join(__dirname, '../certs/certificado.p12');
        const p12Buffer = fs.readFileSync(p12Path);

        // 2. Inyectar el espacio reservado (ByteRange) en el PDF crudo
        const pdfWithPlaceholder = plainAddPlaceholder({
            pdfBuffer: pdfBuffer,
            reason: 'Firma Digital GDE Autorizada',
            location: 'Servidor Central',
            signatureLength: 8192, // Tamaño estándar seguro
        });

        // 3. Aplicar la firma criptográfica
        // Nota: Reemplaza 'tu_contraseña' por la que pusiste en el paso 1 de OpenSSL
        const signedPdf = signpdf.sign(pdfWithPlaceholder, p12Buffer, {
            passphrase: '' 
        });

        return signedPdf;
    } catch (error) {
        console.error("Error en la firma criptográfica:", error);
        throw error;
    }
};