// utils/sanitizer.js
// Sanitización HTML para prevenir XSS (OWASP A03)
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

// Crear instancia de DOMPurify con jsdom
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * Sanitiza HTML: permite tags seguros de formato pero elimina scripts y event handlers
 * Usado para el contenido de documentos (content de TinyMCE)
 */
function sanitizeHtml(dirty) {
    if (!dirty || typeof dirty !== 'string') return dirty;
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: [
            'p', 'br', 'strong', 'em', 'u', 's', 'sub', 'sup',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'a', 'img', 'span', 'div', 'hr',
            'font', 'b', 'i'
        ],
        ALLOWED_ATTR: [
            'href', 'src', 'alt', 'title', 'class', 'style',
            'colspan', 'rowspan', 'width', 'height', 'align', 'valign',
            'target', 'rel', 'color', 'size', 'face'
        ],
        ALLOW_DATA_ATTR: false,
        ADD_ATTR: ['target'],
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
    });
}

/**
 * Sanitiza texto plano: elimina TODO el HTML.
 * Usado para subjects, nombres, mensajes de notificación.
 */
function sanitizeText(dirty) {
    if (!dirty || typeof dirty !== 'string') return dirty;
    return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

/**
 * Escapa caracteres HTML para interpolación segura en templates.
 */
function escapeHtml(str) {
    if (!str || typeof str !== 'string') return str;
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, (c) => map[c]);
}

module.exports = { sanitizeHtml, sanitizeText, escapeHtml };
