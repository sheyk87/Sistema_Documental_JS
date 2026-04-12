// ==========================================
// 1. DATOS INICIALES Y ESTADO GLOBAL
// ==========================================
const INITIAL_AREAS = [
    { id: 'a1', name: 'Dirección General' }, { id: 'a2', name: 'Recursos Humanos' }, { id: 'a3', name: 'Sistemas' }
];

const INITIAL_USERS = [
    { id: 'u1', name: 'Admin Sistema', email: 'admin@gde.com', password: '123', areaId: 'a3', role: 'admin' },
    { id: 'u2', name: 'Juan Perez', email: 'juan@gde.com', password: '123', areaId: 'a1', role: 'user' },
    { id: 'u3', name: 'Maria Gomez', email: 'maria@gde.com', password: '123', areaId: 'a2', role: 'user' },
    { id: 'u4', name: 'Carlos Lopez', email: 'carlos@gde.com', password: '123', areaId: 'a3', role: 'user' }
];

const DOC_TYPES = {
    CON_DEST_EXCL: ['Solicitud', 'Solicitud de Compra', 'Solicitud de Gasto', 'Orden de Compra', 'Carta'],
    CON_DEST_MULT: ['Memo', 'Nota', 'Notificación', 'Circular'],
    SIN_DEST: ['Acta', 'Informe', 'Resolucion', 'Disposicion', 'Actuacion', 'Dictamen', 'Sanción', 'Acuerdo de confidencialidad', 'Factura', 'Presupuesto', 'Balance', 'Informes Técnico', 'Evaluación', 'Manual de procedimientos', 'Código de conducta', 'Política Interna', 'Contrato']
};

const STATUS = {
    BORRADOR: 'Borrador', FIRMANDOSE: 'Firmandose', FIRMADO: 'Firmado', RECHAZADO: 'Rechazado',
    ANULADO: 'Anulado', DERIVADO: 'Derivado', ARCHIVADO: 'Archivado', ELIMINADO: 'Eliminado'
};

const CHART_COLORS = {
    'Memo': '#f59e0b', 'Nota': '#22c55e', 'Acta': '#f97316', 'Informe': '#3b82f6',
    'Resolucion': '#ef4444', 'Disposicion': '#14b8a6', 'Actuacion': '#6366f1',
    'Dictamen': '#8b5cf6', 'Sanción': '#e11d48', 'Acuerdo de confidencialidad': '#64748b',
    'Factura': '#84cc16', 'Presupuesto': '#10b981', 'Balance': '#06b6d4',
    'Informes Técnico': '#0ea5e9', 'Evaluación': '#a855f7', 'Manual de procedimientos': '#d946ef',
    'Código de conducta': '#ec4899', 'Política Interna': '#f43f5e', 'Contrato': '#78716c',
    'Solicitud': '#0284c7', 'Solicitud de Compra': '#059669', 'Solicitud de Gasto': '#dc2626',
    'Orden de Compra': '#0d9488', 'Carta': '#ea580c', 'Notificación': '#eab308', 'Circular': '#2563eb',
    'expediente': '#9333ea', 'default': '#94a3b8'
};

let state = {
    db: { areas: INITIAL_AREAS, users: INITIAL_USERS, documents: [], expedientes: [], counters: {} },
    currentUser: null, currentView: 'inbox', selectedItem: null,
    searchTerms: { inbox: '', drafts: '', search: '', archive: '', anulados: '', expDetail: '', globalFilter: 'todos', docTypeCreate: '' },
    sort: {
        inboxDoc: { field: 'date', order: 'desc' }, inboxExp: { field: 'date', order: 'desc' },
        areaDoc: { field: 'date', order: 'desc' }, areaExp: { field: 'date', order: 'desc' },
        drafts: { field: 'date', order: 'desc' }, search: { field: 'date', order: 'desc' },
        archiveDoc: { field: 'date', order: 'desc' }, archiveExp: { field: 'date', order: 'desc' },
        anuladosDoc: { field: 'date', order: 'desc' }, anuladosExp: { field: 'date', order: 'desc' }
    },
    menus: { trabajo: true, nuevo: true, consultas: true, admin: true, inboxPersonal: true, inboxArea: true },
    ui: { sidebarOpen: true },
    statsOpts: { tab: 'generales', types: ['all'], areas: ['all'], users: ['all'], dateFrom: '', dateTo: '', chartType: 'bar' },
    modal: null
};

function initTinyMCE(selector) {
    if (window.tinymce) {
        tinymce.remove(selector);
        tinymce.init({
            selector: selector,
            // language: 'es',
            plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount',
            toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | table link code | removeformat | fullscreen preview',
            menubar: 'file edit view insert format tools table help',
            height: 500,
            promotion: false,
            content_style: 'body { font-family: Times New Roman, serif; font-size: 16px; color: #1e293b; line-height: 1.6; } table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #cbd5e1; padding: 8px; }',
            setup: function (editor) {
                editor.on('change', function () { editor.save(); });
            }
        });
    }
}

let chartInstances = {}, currentStatsData = {}, activeInputSelector = null, isChartLoading = false;
const appRoot = document.getElementById('app-root');

if (!window.Chart && !isChartLoading) {
    isChartLoading = true;
    const script1 = document.createElement('script'); script1.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script1.onload = () => {
        const script2 = document.createElement('script'); script2.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0';
        script2.onload = () => { Chart.register(ChartDataLabels); isChartLoading = false; if (state.currentView === 'stats') renderApp(); };
        document.head.appendChild(script2);
    };
    document.head.appendChild(script1);
}

// ==========================================
// 2. FUNCIONES AUXILIARES GLOBALES
// ==========================================
function restoreInputFocus() {
    if (activeInputSelector) { const input = document.querySelector(activeInputSelector); if (input) { input.focus(); const val = input.value; input.value = ''; input.value = val; } }
}
const createHistoryEntry = (userId, action, notes = '') => ({ date: new Date().toISOString(), userId, action, notes });
const getUserName = (id) => state.db.users.find(u => u.id === id)?.name || 'Desconocido';
const getAreaName = (id) => state.db.areas.find(a => a.id === id)?.name || 'Desconocida';
const getCurrentYear = () => new Date().getFullYear().toString();
function formatDateOnly(dateString) { const d = new Date(dateString); return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`; }

const getDocCode = (type) => {
    const map = { 'Memo': 'ME', 'Nota': 'NO', 'Informe': 'IF', 'Acta': 'ACTA', 'Resolucion': 'RESOL', 'Disposicion': 'DISP', 'Actuacion': 'ACTU', 'expediente': 'EX', 'Dictamen': 'DICT', 'Sanción': 'SANC', 'Acuerdo de confidencialidad': 'CONF', 'Factura': 'FACT', 'Presupuesto': 'PRESUP', 'Balance': 'BAL', 'Informes Técnico': 'IFT', 'Evaluación': 'EVAL', 'Manual de procedimientos': 'MPROC', 'Código de conducta': 'CCOND', 'Política Interna': 'POL', 'Contrato': 'CONT', 'Solicitud': 'SOLI', 'Solicitud de Compra': 'SC', 'Solicitud de Gasto': 'GASTO', 'Orden de Compra': 'OC', 'Carta': 'CAR', 'Notificación': 'NOTI', 'Circular': 'CIRC' };
    return map[type] || type.toUpperCase().substring(0, 4);
};

const generateNumber = (type, areaName) => {
    const year = getCurrentYear(); const code = getDocCode(type); const key = `${year}-${code}`; state.db.counters[key] = (state.db.counters[key] || 0) + 1;
    return `${year}-${code}-${String(state.db.counters[key]).padStart(6, '0')}-${areaName}`;
};

function setState(newState) { state = { ...state, ...newState }; renderApp(); }

function getBadgeColor(status) {
    const colors = { [STATUS.BORRADOR]: 'bg-gray-100 text-gray-600 border-gray-200', [STATUS.FIRMANDOSE]: 'bg-amber-100 text-amber-700 border-amber-200', [STATUS.FIRMADO]: 'bg-emerald-100 text-emerald-700 border-emerald-200', [STATUS.RECHAZADO]: 'bg-red-100 text-red-700 border-red-200', [STATUS.ANULADO]: 'bg-slate-800 text-slate-200 border-slate-700', [STATUS.ELIMINADO]: 'bg-red-900 text-red-100 border-red-900', [STATUS.DERIVADO]: 'bg-indigo-100 text-indigo-700 border-indigo-200', [STATUS.ARCHIVADO]: 'bg-stone-100 text-stone-600 border-stone-200' };
    return colors[status] || colors[STATUS.BORRADOR];
}

function getTypeColorClass(type) {
    const colors = {
        'Memo': 'bg-amber-100 text-amber-800', 'Nota': 'bg-green-100 text-green-800', 'Acta': 'bg-orange-100 text-orange-800', 'Informe': 'bg-blue-100 text-blue-800', 'Resolucion': 'bg-red-100 text-red-800', 'Disposicion': 'bg-teal-100 text-teal-800', 'Actuacion': 'bg-indigo-100 text-indigo-800', 'Dictamen': 'bg-purple-100 text-purple-800', 'Sanción': 'bg-rose-100 text-rose-800', 'Acuerdo de confidencialidad': 'bg-slate-200 text-slate-800', 'Factura': 'bg-lime-100 text-lime-800', 'Presupuesto': 'bg-emerald-100 text-emerald-800', 'Balance': 'bg-cyan-100 text-cyan-800', 'Informes Técnico': 'bg-sky-100 text-sky-800', 'Evaluación': 'bg-violet-100 text-violet-800', 'Manual de procedimientos': 'bg-fuchsia-100 text-fuchsia-800', 'Código de conducta': 'bg-pink-100 text-pink-800', 'Política Interna': 'bg-rose-100 text-rose-800', 'Contrato': 'bg-stone-200 text-stone-800', 'Solicitud': 'bg-sky-100 text-sky-800', 'Solicitud de Compra': 'bg-emerald-100 text-emerald-800', 'Solicitud de Gasto': 'bg-red-100 text-red-800', 'Orden de Compra': 'bg-teal-100 text-teal-800', 'Carta': 'bg-orange-100 text-orange-800', 'Notificación': 'bg-yellow-100 text-yellow-800', 'Circular': 'bg-blue-100 text-blue-800', 'expediente': 'bg-purple-100 text-purple-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
}

function getSender(item) {
    if (!item.history || item.history.length === 0) return 'Sistema';
    const transferActions = ['Derivad', 'Enviado a Revisar', 'Rechazado', 'Enviado a firmar'];
    const lastTransfer = [...item.history].reverse().find(h => transferActions.some(act => h.action.includes(act)));
    return lastTransfer ? getUserName(lastTransfer.userId) : getUserName(item.creatorId);
}

function canViewExpediente(exp, user) {
    if (exp.isPublic || exp.creatorId === user.id || exp.currentOwnerId === user.id || exp.currentOwnerId === user.areaId) return true;
    if (exp.authUsers?.includes(user.id) || exp.authAreas?.includes(user.areaId)) return true; return false;
}
function isPersonalDoc(d, user) {
    if ([STATUS.ELIMINADO, STATUS.ARCHIVADO, STATUS.ANULADO].includes(d.status)) return false;
    if (isHiddenFromInbox(d, user)) return false; // Filtramos si el usuario lo ocultó
    if ([STATUS.BORRADOR, STATUS.FIRMANDOSE, STATUS.RECHAZADO].includes(d.status)) return d.currentOwnerId === user.id;
    return d.owners?.includes(user.id);
}
function isAreaDoc(d, user) { return !([STATUS.ELIMINADO, STATUS.ARCHIVADO, STATUS.ANULADO, STATUS.BORRADOR, STATUS.FIRMANDOSE, STATUS.RECHAZADO].includes(d.status)) && d.owners?.includes(user.areaId); }
function isPersonalExp(e, user) { 
    if ([STATUS.ELIMINADO, STATUS.ARCHIVADO, STATUS.ANULADO].includes(e.status)) return false;
    if (isHiddenFromInbox(e, user)) return false; // Filtramos si el usuario lo ocultó
    return e.currentOwnerId === user.id; 
}
function isAreaExp(e, user) { return ![STATUS.ELIMINADO, STATUS.ARCHIVADO, STATUS.ANULADO].includes(e.status) && e.currentOwnerId === user.areaId; }
// --- NUEVO: Motor de Limpieza de Bandeja Personal ---
function isHiddenFromInbox(item, user) {
    if (!item.history) return false;
    // Buscamos si la última acción de visibilidad de ESTE usuario fue "Ocultado"
    const visibilityActions = item.history.filter(h => h.userId === user.id && (h.action === 'Ocultado' || h.action === 'Restaurado'));
    return visibilityActions.length > 0 ? visibilityActions[visibilityActions.length - 1].action === 'Ocultado' : false;
}
function getDerivationsCount(item) { return item.history.filter(h => h.action.includes('Derivad')).length; }
function getRejectionsCount(item) { return item.history.filter(h => h.action === 'Rechazado').length; }
const getColorPalette = (idx) => { const p = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e']; return p[idx % p.length]; };

// ==========================================
// 3. EXPORTACIÓN Y TABLAS
// ==========================================
function exportToCSV(filename, rows) {
    const processRow = row => row.map(val => `"${(val === null || val === undefined ? '' : val.toString()).replace(/"/g, '""')}"`).join(',');
    const blob = new Blob([rows.map(processRow).join('\n')], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a");
    if (link.download !== undefined) { link.setAttribute("href", URL.createObjectURL(blob)); link.setAttribute("download", filename); link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link); }
}

function handleExport(model) {
    let items = [], headers = [], rows = [];
    if (model === 'admin_users') { headers = ['ID', 'Nombre', 'Email', 'Área', 'Rol']; rows = [headers, ...state.db.users.map(u => [u.id, u.name, u.email, getAreaName(u.areaId), u.role])]; }
    else if (model === 'admin_areas') { headers = ['ID', 'Nombre', 'Usuarios']; rows = [headers, ...state.db.areas.map(a => [a.id, a.name, state.db.users.filter(u=>u.areaId===a.id).length])]; }
    else if (model === 'stats') {
        let r = [['--- ESTADISTICAS EXPORTADAS ---']];
        if (currentStatsData.totals) { r.push(['',''],['TOTALES GENERALES']); Object.entries(currentStatsData.totals).forEach(([k, v]) => r.push([k, v])); }
        if (currentStatsData.top) { r.push(['','']); Object.entries(currentStatsData.top).forEach(([title, list]) => { r.push([title.toUpperCase()], ['Elemento', 'Cantidad']); list.forEach(i => r.push([i.label, i.count])); r.push(['','']); }); }
        return exportToCSV(`Estadisticas_GDE.csv`, r);
    } else {
        headers = ['Número', 'Tipo', 'Asunto', 'Estado', 'Enviado Por', 'Fecha', 'Fojas']; items = sortItems([...getFilteredItemsForModel(model)], model);
        rows = [headers, ...items.map(i => [i.number || 'S/N', i.docType || i.type, i.subject, i.status, getSender(i), formatDateOnly(i.createdAt), i.linkedDocs?.length || 0])];
    }
    exportToCSV(`${model}_export.csv`, rows);
}

// --- NUEVO: GENERADOR DE PDF Y ZIP ---

// Crea el PDF del documento respetando el diseño visual y las referencias
async function generatePDFBlob(doc) {
    const tempDiv = document.createElement('div');
    tempDiv.style.padding = '40px';
    tempDiv.style.fontFamily = 'Georgia, serif';
    tempDiv.style.color = '#333';
    
    // 1. Buscamos las referencias (Expedientes, Relacionados y Adjuntos)
    const vinculados = state.db.expedientes.filter(e => e.linkedDocs && e.linkedDocs.includes(doc.id));
    const relacionados = (doc.relatedDocs || []).map(did => state.db.documents.find(d => d.id === did)).filter(Boolean);
    const adjuntos = doc.attachments || [];

    let referenciasHtml = '';
    if (vinculados.length > 0 || relacionados.length > 0 || adjuntos.length > 0) {
        referenciasHtml = `
            <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; page-break-inside: avoid;">
                <h3 style="color: #475569; font-size: 13px; font-family: sans-serif; margin-bottom: 15px; letter-spacing: 1px;">REFERENCIAS DEL DOCUMENTO</h3>
                ${vinculados.length > 0 ? `
                    <div style="margin-bottom: 15px;">
                        <strong style="font-size: 12px; color: #334155; font-family: sans-serif;">Vinculado en Expedientes:</strong>
                        <ul style="margin: 5px 0 0 20px; font-size: 12px; color: #64748b; font-family: sans-serif;">
                            ${vinculados.map(e => `<li>${e.number} - ${e.subject}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                ${relacionados.length > 0 ? `
                    <div style="margin-bottom: 15px;">
                        <strong style="font-size: 12px; color: #334155; font-family: sans-serif;">Documentos Relacionados:</strong>
                        <ul style="margin: 5px 0 0 20px; font-size: 12px; color: #64748b; font-family: sans-serif;">
                            ${relacionados.map(d => `<li>${d.number} - ${d.subject}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                ${adjuntos.length > 0 ? `
                    <div style="margin-bottom: 15px;">
                        <strong style="font-size: 12px; color: #334155; font-family: sans-serif;">Archivos Adjuntos (Anexos):</strong>
                        <ul style="margin: 5px 0 0 20px; font-size: 12px; color: #64748b; font-family: sans-serif;">
                            ${adjuntos.map(a => `<li>${a.originalname} <span style="font-size: 10px; color: #94a3b8;">(${(a.size / 1024).toFixed(1)} KB)</span></li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // 2. Logica para el campo PROMOTOR
    const isConDestinatario = DOC_TYPES.CON_DEST_MULT.includes(doc.docType) || DOC_TYPES.CON_DEST_EXCL.includes(doc.docType);
    let promotorHtml = '';
    
    if (isConDestinatario && doc.signedBy && doc.signedBy.length > 0) {
        const lastSignerId = doc.signedBy[doc.signedBy.length - 1].id;
        const lastSignerUser = state.db.users.find(u => u.id === lastSignerId);
        const promotorArea = lastSignerUser ? getAreaName(lastSignerUser.areaId) : 'Desconocida';
        promotorHtml = `<p style="margin: 0 0 8px 0; color: #334155;"><strong>PROMOTOR:</strong> ${promotorArea}</p>`;
    }

    // 3. Armamos el bloque de firmas
    let firmasHtml = '<p style="margin-top: 40px; color: #94a3b8; font-style: italic;">Documento sin firmar</p>';
    if (doc.signedBy && doc.signedBy.length > 0) {
        firmasHtml = `
            <div style="margin-top: 40px; border-top: 2px solid #e2e8f0; padding-top: 20px; page-break-inside: avoid;">
                <h3 style="color: #475569; font-size: 13px; font-family: sans-serif; margin-bottom: 20px; letter-spacing: 1px;">FIRMAS DIGITALES</h3>
                <div style="display: flex; flex-wrap: wrap; gap: 30px;">
                ${doc.signedBy.map(s => {
                    const u = state.db.users.find(user => user.id === s.id);
                    return `
                        <div style="margin-bottom: 15px; text-align: left; min-width: 200px;">
                            <p style="margin: 0 0 5px 0; font-family: serif; font-style: italic; color: #059669; border-bottom: 1px solid #a7f3d0; display: inline-block; padding-bottom: 2px;">Firmado Digitalmente</p>
                            <p style="margin: 5px 0 0 0; font-weight: bold; color: #1e293b; font-size: 14px;">${u ? u.name : 'Usuario Desconocido'}</p>
                            <p style="margin: 2px 0 0 0; font-size: 12px; color: #475569;">${u ? getAreaName(u.areaId) : ''}</p>
                            <p style="margin: 2px 0 0 0; font-size: 10px; color: #94a3b8; font-family: monospace;">Fecha: ${new Date(s.date).toLocaleString()}</p>
                        </div>`;
                }).join('')}
                </div>
            </div>
        `;
    }

    // 4. Compilamos todo el HTML
    tempDiv.innerHTML = `
        <h1 style="text-align:center; font-size: 22px; margin-bottom: 5px; color: #0f172a; font-family: sans-serif; letter-spacing: 1px;">${doc.docType.toUpperCase()}</h1>
        <h2 style="text-align:center; font-size: 16px; margin-bottom: 30px; color: #64748b; font-family: monospace;">Nro: ${doc.number || 'S/N (Borrador)'}</h2>
        
        <div style="margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; font-family: sans-serif; font-size: 13px;">
            <p style="margin: 0 0 8px 0; color: #334155;"><strong>FECHA:</strong> ${formatDateOnly(doc.createdAt)}</p>
            <p style="margin: 0 0 8px 0; color: #334155;"><strong>ASUNTO:</strong> ${doc.subject}</p>
            ${promotorHtml}
            ${doc.recipients && doc.recipients.length > 0 ? `<p style="margin: 0; color: #334155;"><strong>DESTINATARIOS:</strong> ${doc.recipients.map(id => id.startsWith('a') ? `Area: ${getAreaName(id)}` : getUserName(id)).join(', ')}</p>` : ''}
        </div>
        
        <div style="font-size: 14px; line-height: 1.8; text-align: justify; min-height: 300px;">${doc.content}</div>
        
        ${referenciasHtml}
        ${firmasHtml}
    `;
    
    const style = document.createElement('style');
    style.innerHTML = `table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #ccc; padding: 8px; }`;
    tempDiv.prepend(style);

    const opt = {
        margin: 20,
        filename: `${doc.number || 'Borrador'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    return await html2pdf().set(opt).from(tempDiv).outputPdf('blob');
}

// Empaqueta el PDF y sus adjuntos en un ZIP
async function downloadDocumentArchive(docId) {
    const doc = state.db.documents.find(d => d.id === docId);
    if (!doc) return;
    
    const zip = new JSZip();
    
    // 1. Generamos y guardamos el PDF principal
    const pdfBlob = await generatePDFBlob(doc);
    zip.file(`${doc.number || 'Borrador'}.pdf`, pdfBlob);
    
    // 2. Buscamos y guardamos los adjuntos reales desde el Backend
    if (doc.attachments && doc.attachments.length > 0) {
        const attFolder = zip.folder("Archivos_Adjuntos");
        for (let att of doc.attachments) {
            try {
                const resp = await fetch(`http://localhost:3000/api/docs/download/${att.filename}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` }
                });
                const blob = await resp.blob();
                attFolder.file(att.originalname, blob);
            } catch(e) { console.error("Error al descargar adjunto:", e); }
        }
    }
    
    // 3. Generamos el ZIP y forzamos la descarga
    const zipBlob = await zip.generateAsync({ type: "blob" });
    saveAs(zipBlob, `${doc.number || 'Documento'}.zip`);
}

// Empaqueta todo el expediente (TXT + Múltiples Fojas PDF + Adjuntos)
async function downloadFullExpediente(expId) {
    const exp = state.db.expedientes.find(e => e.id === expId);
    if (!exp) return;
    
    const zip = new JSZip();
    
    // 1. Creamos el archivo de texto con el historial
    let historyText = `=== HISTORIAL DEL EXPEDIENTE ===\nNÚMERO: ${exp.number}\nASUNTO: ${exp.subject}\nCREADO: ${formatDateOnly(exp.createdAt)}\n\n`;
    [...exp.history].reverse().forEach(h => {
        historyText += `[${new Date(h.date).toLocaleString()}] ${h.action} \nActor: ${getUserName(h.userId)}\nNotas: ${h.notes || 'Sin notas'}\n-----------------------------------\n`;
    });
    zip.file(`Historial_${exp.number}.txt`, historyText);
    
    // 2. Iteramos sobre cada foja vinculada
    if (exp.linkedDocs && exp.linkedDocs.length > 0) {
        for (let i = 0; i < exp.linkedDocs.length; i++) {
            const docId = exp.linkedDocs[i];
            const doc = state.db.documents.find(d => d.id === docId);
            if (doc) {
                // Creamos una carpeta por cada foja
                const fojaName = `Foja_${String(i + 1).padStart(3, '0')}_${doc.number}`;
                const docFolder = zip.folder(fojaName);
                
                // Agregamos el PDF del documento
                const pdfBlob = await generatePDFBlob(doc);
                docFolder.file(`${doc.number}.pdf`, pdfBlob);
                
                // Si la foja tiene adjuntos, los metemos en su respectiva subcarpeta
                if (doc.attachments && doc.attachments.length > 0) {
                    const attFolder = docFolder.folder("Adjuntos");
                    for (let att of doc.attachments) {
                        try {
                            const resp = await fetch(`http://localhost:3000/api/docs/download/${att.filename}`, {
                                headers: { 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` }
                            });
                            const blob = await resp.blob();
                            attFolder.file(att.originalname, blob);
                        } catch(e) { console.error(e); }
                    }
                }
            }
        }
    }
    
    // 3. Compilamos y descargamos el mega-archivo ZIP
    const zipBlob = await zip.generateAsync({ type: "blob" });
    saveAs(zipBlob, `${exp.number}_Completo.zip`);
}

function getFilteredItemsForModel(model) {
    const term = state.searchTerms[model.replace(/(Doc|Exp)$/, '')] || '';
    switch(model) {
        case 'inboxDoc': return state.db.documents.filter(d => isPersonalDoc(d, state.currentUser)).filter(d => filterItem(d, term));
        case 'inboxExp': return state.db.expedientes.filter(e => isPersonalExp(e, state.currentUser)).filter(e => filterItem(e, term));
        case 'areaDoc': return state.db.documents.filter(d => isAreaDoc(d, state.currentUser) && !isPersonalDoc(d, state.currentUser)).filter(d => filterItem(d, term));
        case 'areaExp': return state.db.expedientes.filter(e => isAreaExp(e, state.currentUser) && !isPersonalExp(e, state.currentUser)).filter(e => filterItem(e, term));
        case 'drafts': return state.db.documents.filter(d => d.creatorId === state.currentUser.id && (d.status === STATUS.BORRADOR || d.status === STATUS.RECHAZADO) && d.currentOwnerId === state.currentUser.id).filter(d => filterItem(d, term));
        case 'archiveDoc': return state.db.documents.filter(d => d.status === STATUS.ARCHIVADO && (d.creatorId === state.currentUser.id || d.owners?.includes(state.currentUser.id) || d.owners?.includes(state.currentUser.areaId) || state.db.users.find(u=>u.id===d.creatorId)?.areaId === state.currentUser.areaId)).filter(d => filterItem(d, term));
        case 'archiveExp': return state.db.expedientes.filter(e => e.status === STATUS.ARCHIVADO && canViewExpediente(e, state.currentUser)).filter(e => filterItem(e, term));
        case 'anuladosDoc': return state.db.documents.filter(d => d.status === STATUS.ANULADO).filter(d => filterItem(d, term));
        case 'anuladosExp': return state.db.expedientes.filter(e => e.status === STATUS.ANULADO && canViewExpediente(e, state.currentUser)).filter(e => filterItem(e, term));
        case 'search': 
            const sDocs = state.db.documents.filter(d => ![STATUS.BORRADOR, STATUS.FIRMANDOSE, STATUS.ELIMINADO].includes(d.status) && (state.db.users.find(u => u.id === d.creatorId)?.areaId === state.currentUser.areaId || d.owners?.includes(state.currentUser.id) || d.owners?.includes(state.currentUser.areaId)));
            const sExps = state.db.expedientes.filter(e => e.status !== STATUS.ELIMINADO && canViewExpediente(e, state.currentUser));
            return [...sDocs, ...sExps].filter(item => filterItem(item, term));
        default: return [];
    }
}

function filterItem(item, term) {
    if (!term) return true; const t = term.toLowerCase();
    return ((item.number || '').toLowerCase().includes(t) || (item.docType || item.type).toLowerCase().includes(t) || item.subject.toLowerCase().includes(t) || item.status.toLowerCase().includes(t) || getSender(item).toLowerCase().includes(t) || formatDateOnly(item.createdAt).includes(t));
}

function sortItems(items, model) {
    const s = state.sort[model] || { field: 'date', order: 'desc' };
    return items.sort((a, b) => {
        let vA, vB;
        switch(s.field) {
            case 'number': vA = a.number || ''; vB = b.number || ''; break;
            case 'type': vA = a.docType || a.type; vB = b.docType || b.type; break;
            case 'subject': vA = a.subject.toLowerCase(); vB = b.subject.toLowerCase(); break;
            case 'status': vA = a.status; vB = b.status; break;
            case 'sender': vA = getSender(a).toLowerCase(); vB = getSender(b).toLowerCase(); break;
            case 'acceso': vA = a.type === 'expediente' ? (a.isPublic ? 'Publico' : 'Reservado') : '-'; vB = b.type === 'expediente' ? (b.isPublic ? 'Publico' : 'Reservado') : '-'; break;
            case 'fojas': vA = a.type === 'expediente' ? (a.linkedDocs?.length || 0) : -1; vB = b.type === 'expediente' ? (b.linkedDocs?.length || 0) : -1; break;
            case 'date': default: vA = new Date(a.createdAt).getTime(); vB = new Date(b.createdAt).getTime(); break;
        }
        if(vA < vB) return s.order === 'asc' ? -1 : 1;
        if(vA > vB) return s.order === 'asc' ? 1 : -1; return 0;
    });
}

function renderTable(items, model, emptyMsg, isExpList = false, showAcquireBtn = false) {
    const sortedItems = sortItems(items, model); const s = state.sort[model] || { field: 'date', order: 'desc' };
    const th = (label, field) => `<th class="p-4 font-medium border-b border-gray-200 cursor-pointer hover:bg-gray-100 whitespace-nowrap" data-sort="${model}" data-field="${field}">${label} <i data-lucide="${s.field === field ? (s.order === 'asc' ? 'chevron-up' : 'chevron-down') : 'minus'}" class="inline w-3 h-3 text-gray-400"></i></th>`;

    if (sortedItems.length === 0) return `<table class="w-full text-left border-collapse"><tbody><tr><td class="p-8 text-center text-gray-500 text-sm">${emptyMsg}</td></tr></tbody></table>`;

    return `
        <div class="overflow-x-auto relative">
            <div class="absolute top-2 right-4 z-10"><button data-action="export-csv" data-model="${model}" class="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded hover:bg-slate-300 font-bold flex items-center gap-1"><i data-lucide="download" class="w-3 h-3"></i> CSV</button></div>
            <table class="w-full text-left border-collapse mt-8">
                <thead><tr class="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">${th('ID/Número', 'number')} ${th('Tipo', 'type')} ${th('Asunto', 'subject')} ${th('Estado', 'status')} ${th('Enviado Por', 'sender')} ${isExpList ? th('Acceso', 'acceso') : ''} ${th('Fecha', 'date')} ${isExpList ? th('Fojas', 'fojas') : ''} ${showAcquireBtn ? `<th class="p-4 font-medium border-b border-gray-200">Acción</th>` : ''}</tr></thead>
                <tbody class="divide-y divide-gray-100 text-sm">
                    ${sortedItems.map(item => `
                        <tr class="hover:bg-blue-50/50 transition-colors group cursor-pointer" data-id="${item.id}" data-type="${item.type}">
                            <td class="p-4 font-mono text-xs text-gray-600">${item.number || 'S/N (Borrador)'}</td>
                            <td class="p-4"><span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${getTypeColorClass(item.docType || item.type)}"><i data-lucide="${item.type === 'expediente' ? 'folder-open' : 'file-text'}" class="w-3 h-3"></i> ${item.docType || 'Expediente'}</span></td>
                            <td class="p-4 font-medium text-gray-800">${item.subject}</td>
                            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-medium border ${getBadgeColor(item.status)}">${item.status}</span></td>
                            <td class="p-4 text-gray-700">${getSender(item)}</td>
                            ${isExpList ? `<td class="p-4 text-gray-600 text-xs font-semibold uppercase tracking-wider">${item.type === 'expediente' ? (item.isPublic ? 'Público' : 'Reservado') : '-'}</td>` : ''}
                            <td class="p-4 text-gray-500">${formatDateOnly(item.createdAt)}</td>
                            ${isExpList ? `<td class="p-4 text-gray-600 font-bold">${item.type === 'expediente' ? (item.linkedDocs?.length || 0) : '-'}</td>` : ''}
                            ${showAcquireBtn ? `<td class="p-4"><button data-action="acquire-item" data-id="${item.id}" data-type="${item.type}" class="px-3 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200 transition-colors flex items-center gap-1"><i data-lucide="download" class="w-3 h-3"></i> Adquirir</button></td>` : ''}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ==========================================
// 4. ESTADÍSTICAS Y GRÁFICOS
// ==========================================
function checkStatsFilters(entryDateStr, entryUserId, entryDocType) {
    const o = state.statsOpts;
    if (o.types && !o.types.includes('all') && !o.types.includes(entryDocType)) return false;
    const uArea = state.db.users.find(u=>u.id===entryUserId)?.areaId;
    if (o.areas && !o.areas.includes('all') && !o.areas.includes(uArea)) return false;
    if (o.users && !o.users.includes('all') && !o.users.includes(entryUserId)) return false;
    if (entryDateStr) {
        const dTime = new Date(entryDateStr).getTime();
        if (o.dateFrom && dTime < new Date(o.dateFrom).getTime()) return false;
        if (o.dateTo && dTime > new Date(o.dateTo).setHours(23,59,59)) return false;
    }
    return true;
}

function getAggregatedStats() {
    let totals = { firmados: 0, derivaciones: 0, vinculaciones: 0, relaciones: 0, expsCreados: 0, archD: 0, archE: 0, anulados: 0, usuarios: state.db.users.length, areas: state.db.areas.length };
    let usersMap = {}, areasMap = {};
    const initMap = (map, id, label) => { if(!map[id]) map[id] = { label, firmados: 0, creados: 0, derivaciones: 0, vinculaciones: 0, relaciones: 0, anulaciones: 0, archDesarchD: 0, archDesarchE: 0, rechazados: 0 }; };

    state.db.users.forEach(u => initMap(usersMap, u.id, u.name)); state.db.areas.forEach(a => initMap(areasMap, a.id, a.name));

    state.db.documents.forEach(d => {
        let relationsCounted = false;
        if (d.relatedDocs && d.relatedDocs.length > 0 && checkStatsFilters(d.createdAt, d.creatorId, d.docType)) {
            const u = state.db.users.find(x=>x.id===d.creatorId);
            if (u) { usersMap[u.id].relaciones += d.relatedDocs.length; areasMap[u.areaId].relaciones += d.relatedDocs.length; }
        }
        d.history.forEach(h => {
            const u = state.db.users.find(x=>x.id===h.userId); if (!u || !checkStatsFilters(h.date, h.userId, d.docType)) return;
            const inc = (key) => { usersMap[h.userId][key]++; areasMap[u.areaId][key]++; };
            if (h.action.includes('Firma')) { totals.firmados++; inc('firmados'); }
            if (h.action.includes('Derivad')) { totals.derivaciones++; inc('derivaciones'); }
            if (h.action.includes('Archivado') || h.action.includes('Desarchivado')) { totals.archD++; inc('archDesarchD'); }
            if (h.action === 'Anulado') { totals.anulados++; inc('anulaciones'); }
            if (h.action === 'Rechazado') { inc('rechazados'); }
            if (h.action.includes('Firma') && !relationsCounted) { totals.relaciones += (d.relatedDocs?.length || 0); relationsCounted = true; }
        });
    });

    state.db.expedientes.forEach(e => {
        e.history.forEach(h => {
            const u = state.db.users.find(x=>x.id===h.userId); if (!u || !checkStatsFilters(h.date, h.userId, 'expediente')) return;
            const inc = (key) => { usersMap[h.userId][key]++; areasMap[u.areaId][key]++; };
            if (h.action === 'Apertura') { totals.expsCreados++; inc('creados'); }
            if (h.action.includes('Derivad')) { totals.derivaciones++; inc('derivaciones'); }
            if (h.action.includes('Vinculad') || h.action.includes('Desvinculad')) { totals.vinculaciones++; inc('vinculaciones'); }
            if (h.action.includes('Archivado') || h.action.includes('Desarchivado')) { totals.archE++; inc('archDesarchE'); }
            if (h.action === 'Anulado') { totals.anulados++; inc('anulaciones'); }
        });
    });

    const getTop = (map, key) => Object.values(map).sort((a,b)=>b[key]-a[key]).slice(0,10).map(x=>({label: x.label, count: x[key]})).filter(x=>x.count>0);
    return { totals, usersMap, areasMap, top: {
        u_firmados: getTop(usersMap, 'firmados'), u_creados: getTop(usersMap, 'creados'), u_derivaciones: getTop(usersMap, 'derivaciones'), u_vinculaciones: getTop(usersMap, 'vinculaciones'), u_relaciones: getTop(usersMap, 'relaciones'), u_anulaciones: getTop(usersMap, 'anulaciones'), u_archD: getTop(usersMap, 'archDesarchD'), u_archE: getTop(usersMap, 'archDesarchE'), u_rechazados: getTop(usersMap, 'rechazados'),
        a_firmados: getTop(areasMap, 'firmados'), a_creados: getTop(areasMap, 'creados'), a_derivaciones: getTop(areasMap, 'derivaciones'), a_vinculaciones: getTop(areasMap, 'vinculaciones'), a_relaciones: getTop(areasMap, 'relaciones'), a_anulaciones: getTop(areasMap, 'anulaciones'), a_archD: getTop(areasMap, 'archDesarchD'), a_archE: getTop(areasMap, 'archDesarchE'), a_rechazados: getTop(areasMap, 'rechazados')
    }};
}

function renderStats() {
    const o = state.statsOpts; const tab = o.tab; const allTypes = [...DOC_TYPES.CON_DEST_EXCL, ...DOC_TYPES.CON_DEST_MULT, ...DOC_TYPES.SIN_DEST, 'expediente'];
    const renderMultiSelect = (key, label, optionsArr, isObj) => {
        const isAll = o[key].includes('all');
        return `
            <div class="flex-1 min-w-[150px]"><label class="block text-xs font-bold text-gray-500 mb-1">${label} <span class="text-[9px] font-normal">(Ctrl+Click)</span></label>
            <select multiple data-stats-filter-multi="${key}" class="w-full p-2 border rounded text-xs h-20 outline-none"><option value="all" ${isAll ? 'selected' : ''}>Todos</option>
            ${optionsArr.map(opt => `<option value="${isObj ? opt.id : opt}" ${o[key].includes(isObj ? opt.id : opt) && !isAll ? 'selected' : ''}>${isObj ? opt.name : opt}</option>`).join('')}</select></div>`;
    };

    return `
        <div class="max-w-7xl mx-auto space-y-6">
            <div class="flex gap-2 border-b border-gray-200">
                ${['generales', 'docs', 'usuarios', 'areas'].map(t => `<button data-action="set-stats-tab" data-tab="${t}" class="px-6 py-3 text-sm font-bold border-b-2 outline-none ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">${t.toUpperCase()}</button>`).join('')}
                <div class="ml-auto pb-2"><button data-action="export-csv" data-model="stats" class="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2"><i data-lucide="download" class="w-4 h-4"></i> Exportar CSV</button></div>
            </div>
            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-start">
                ${renderMultiSelect('types', 'Tipo Documento', allTypes, false)} ${renderMultiSelect('areas', 'Área', state.db.areas, true)} ${renderMultiSelect('users', 'Usuario', state.db.users, true)}
                <div class="flex flex-col gap-2"><div><label class="block text-xs font-bold text-gray-500 mb-1">Desde</label><input type="date" data-stats-filter="dateFrom" value="${o.dateFrom}" class="p-2 border rounded text-xs w-32 outline-none"/></div><div><label class="block text-xs font-bold text-gray-500 mb-1">Hasta</label><input type="date" data-stats-filter="dateTo" value="${o.dateTo}" class="p-2 border rounded text-xs w-32 outline-none"/></div></div>
                <div class="ml-auto mt-auto flex bg-gray-100 p-1 rounded-lg border"><button data-action="set-chart-type" data-type="pie" class="px-3 py-1 text-xs font-bold rounded outline-none ${o.chartType==='pie'?'bg-white shadow text-blue-600':'text-gray-500'}">Torta</button><button data-action="set-chart-type" data-type="bar" class="px-3 py-1 text-xs font-bold rounded outline-none ${o.chartType==='bar'?'bg-white shadow text-blue-600':'text-gray-500'}">Barras</button></div>
            </div>
            <div id="stats-canvas-container" class="grid grid-cols-2 lg:grid-cols-4 gap-6"></div>
        </div>
    `;
}

function drawCharts() {
    if (!window.Chart) return;
    Object.values(chartInstances).forEach(c => c.destroy()); chartInstances = {};
    const container = document.getElementById('stats-canvas-container'); if(!container) return;

    currentStatsData = getAggregatedStats(); const d = currentStatsData;
    const tab = state.statsOpts.tab; const cType = state.statsOpts.chartType;

    let html = '';
    const addChartContainer = (id, title, span=1) => { html += `<div class="bg-white p-4 rounded-xl shadow-sm border col-span-2 lg:col-span-${span}"><h4 class="font-bold text-sm text-gray-700 mb-4 text-center">${title}</h4><div class="relative h-64 w-full"><canvas id="${id}"></canvas></div></div>`; };
    const addKPI = (title, val, icon, color) => { html += `<div class="bg-white p-6 rounded-xl shadow-sm border border-l-4 border-l-${color}-500 flex items-center justify-between col-span-2 lg:col-span-1"><div><p class="text-xs text-gray-500 font-bold uppercase mb-1">${title}</p><p class="text-3xl font-black text-gray-800">${val}</p></div><i data-lucide="${icon}" class="w-10 h-10 text-${color}-200"></i></div>`; };

    if (tab === 'generales') {
        addKPI('Docs Firmados', d.totals.firmados, 'file-check', 'emerald'); addKPI('Expedientes Creados', d.totals.expsCreados, 'folder-plus', 'purple');
        addKPI('Derivaciones Totales', d.totals.derivaciones, 'share', 'indigo'); addKPI('Fojas Vinculadas', d.totals.vinculaciones, 'link', 'blue');
        addKPI('Docs Relacionados', d.totals.relaciones, 'network', 'amber'); addKPI('Anulaciones', d.totals.anulados, 'ban', 'red');
        addKPI('Docs Archivados', d.totals.archD, 'archive', 'stone'); addKPI('Exps Archivados', d.totals.archE, 'archive', 'stone');
        addKPI('Usuarios Activos', d.totals.usuarios, 'users', 'slate'); addKPI('Áreas Activas', d.totals.areas, 'building', 'slate');
        container.innerHTML = html; if (window.lucide) lucide.createIcons(); return;
    } else if (tab === 'docs') {
        const docs = state.db.documents.filter(doc => checkStatsFilters(doc.createdAt, doc.creatorId, doc.docType));
        const exps = state.db.expedientes.filter(exp => checkStatsFilters(exp.createdAt, exp.creatorId, 'expediente'));
        const countByType = (items) => {
            let c = {}; items.forEach(i => { c[i.docType||i.type] = (c[i.docType||i.type]||0)+1; });
            return { l: Object.keys(c), d: Object.values(c), c: Object.keys(c).map(t=>CHART_COLORS[t]||CHART_COLORS.default) };
        };

        const signedDocs = docs.filter(d => d.history.some(h=>h.action.includes('Firma')));
        let fD = countByType(signedDocs); addChartContainer('c-firm', 'Total Docs Firmados por Tipo', 2);
        let cE = countByType(exps); addChartContainer('c-exp', 'Expedientes Creados', 2);
        let arD = countByType(docs.filter(d=>d.status===STATUS.ARCHIVADO)), arE = countByType(exps.filter(e=>e.status===STATUS.ARCHIVADO)); addChartContainer('c-arch', 'Archivados', 2);
        let anD = countByType(docs.filter(d=>d.status===STATUS.ANULADO)), anE = countByType(exps.filter(e=>e.status===STATUS.ANULADO)); addChartContainer('c-anul', 'Anulados', 2);
        
        addChartContainer('c-top-deriv-doc', 'Docs más Derivados', 2); addChartContainer('c-top-vinc-exp', 'Exps más Vinculados', 2);
        addChartContainer('c-top-rel-doc', 'Docs más Relacionados', 2); addChartContainer('c-top-rech-doc', 'Docs más Rechazados', 2);

        container.innerHTML = html; if (window.lucide) lucide.createIcons();
        const build = (id, l, dat, c) => buildChart(id, l, dat, c, cType);
        
        if(fD.l.length) build('c-firm', fD.l, fD.d, fD.c); if(cE.l.length) build('c-exp', cE.l, cE.d, cE.c);
        if(arD.l.length || arE.l.length) build('c-arch', [...arD.l,...arE.l], [...arD.d,...arE.d], [...arD.c,...arE.c]);
        if(anD.l.length || anE.l.length) build('c-anul', [...anD.l,...anE.l], [...anD.d,...anE.d], [...anD.c,...anE.c]);

        const topDerivD = [...docs].sort((a,b) => getDerivationsCount(b) - getDerivationsCount(a)).filter(d=>getDerivationsCount(d)>0).slice(0,10);
        const topVincE = [...exps].sort((a,b) => (b.linkedDocs?.length||0) - (a.linkedDocs?.length||0)).filter(e=>(e.linkedDocs?.length||0)>0).slice(0,10);
        const topRelD = [...docs].sort((a,b) => (b.relatedDocs?.length||0) - (a.relatedDocs?.length||0)).filter(d=>(d.relatedDocs?.length||0)>0).slice(0,10);
        const topRechD = [...docs].sort((a,b) => getRejectionsCount(b) - getRejectionsCount(a)).filter(d=>getRejectionsCount(d)>0).slice(0,10);
        
        const tc = t => CHART_COLORS[t] || CHART_COLORS['default'];
        if(topDerivD.length) build('c-top-deriv-doc', topDerivD.map(d=>d.number), topDerivD.map(getDerivationsCount), topDerivD.map(d=>tc(d.docType)));
        if(topVincE.length) build('c-top-vinc-exp', topVincE.map(e=>e.number), topVincE.map(e=>e.linkedDocs.length), topVincE.map(()=>CHART_COLORS['expediente']));
        if(topRelD.length) build('c-top-rel-doc', topRelD.map(d=>d.number), topRelD.map(d=>d.relatedDocs.length), topRelD.map(d=>tc(d.docType)));
        if(topRechD.length) build('c-top-rech-doc', topRechD.map(d=>d.number), topRechD.map(getRejectionsCount), topRechD.map(d=>tc(d.docType)));
        return;
    } else {
        const pfx = tab === 'usuarios' ? 'u_' : 'a_'; 
        const chartsToRender = [
            { key: 'firmados', title: 'Más Firmas' }, { key: 'creados', title: 'Más Exps Creados' }, { key: 'derivaciones', title: 'Más Derivaciones' },
            { key: 'vinculaciones', title: 'Más Vinculaciones' }, { key: 'relaciones', title: 'Más Relacionados' }, { key: 'rechazados', title: 'Más Rechazados' },
            { key: 'anulaciones', title: 'Más Anulaciones' }, { key: 'archD', title: 'Más Arch. Docs' }, { key: 'archE', title: 'Más Arch. Exps' }
        ];

        chartsToRender.forEach(c => addChartContainer(`c-top-${c.key}`, c.title, 2));
        container.innerHTML = html; if (window.lucide) lucide.createIcons();
        const buildTop = (id, key) => { const arr = d.top[pfx+key]; if(arr && arr.length > 0) buildChart(id, arr.map(x=>x.label), arr.map(x=>x.count), arr.map((_,i)=>getColorPalette(i)), cType); };
        chartsToRender.forEach(c => buildTop(`c-top-${c.key}`, c.key));
        return;
    }
}

function buildChart(id, labels, data, bgColors, cType) {
    const ctx = document.getElementById(id); if(!ctx) return;
    let options = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: cType==='pie', position: 'right' }, datalabels: { color: cType==='pie'?'#fff':'#475569', font: {weight: 'bold'}, formatter: (v) => v > 0 ? v : '' } } };
    if (cType === 'bar') options.scales = { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } };
    chartInstances[id] = new Chart(ctx, { type: cType, data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 1 }] }, options: options });
}

// ==========================================
// 5. RENDERIZADO PRINCIPAL Y VISTAS
// ==========================================
function renderApp() {
    if (!state.currentUser) appRoot.innerHTML = renderLogin();
    else appRoot.innerHTML = renderMainLayout();
    restoreInputFocus(); if (window.lucide) lucide.createIcons();
    if (state.currentView === 'stats') drawCharts();

    // NUEVAS LÍNEAS PARA TINYMCE
    if (document.getElementById('create-doc-content')) { initTinyMCE('#create-doc-content'); } 
    else if (document.getElementById('edit-doc-content')) { initTinyMCE('#edit-doc-content'); } 
    else { if (window.tinymce) tinymce.remove(); }
}

function renderMenuSection(id, title, icon, itemsHtml) {
    const isOpen = state.menus[id]; const sbOpen = state.ui.sidebarOpen;
    
    if (!sbOpen) {
        return `<div class="space-y-1 mb-4 border-b border-slate-800 pb-4">${itemsHtml}</div>`;
    }
    
    return `
        <div class="mb-1">
            <button data-action="toggle-menu" data-menu="${id}" class="w-full flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider py-3 hover:text-slate-300 transition-colors outline-none">
                <div class="flex items-center gap-2"><span>${title}</span></div>
                <i data-lucide="${isOpen ? 'chevron-down' : 'chevron-right'}" class="w-4 h-4"></i>
            </button>
            <div class="${isOpen ? 'block' : 'hidden'} space-y-1 mt-1">${itemsHtml}</div>
        </div>
    `;
}

function renderMainLayout() {
    const sbw = state.ui.sidebarOpen ? 'w-64' : 'w-20'; const sbo = state.ui.sidebarOpen;
    return `
        <div class="flex h-screen bg-gray-50 font-sans text-gray-800">
            <div class="${sbw} bg-slate-900 text-white flex flex-col shadow-xl z-10 shrink-0 transition-all duration-300">
                <div class="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                    <div class="flex items-center gap-2 ${!sbo ? 'hidden' : ''}"><i data-lucide="building" class="text-blue-400"></i><h1 class="text-xl font-bold text-blue-400">GDE</h1></div>
                    <button data-action="toggle-sidebar" class="text-slate-400 hover:text-white outline-none ${!sbo ? 'mx-auto' : ''}" title="${!sbo ? 'Expandir menú' : 'Contraer menú'}"><i data-lucide="menu"></i></button>
                </div>
                ${sbo ? `<div class="p-4 border-b border-slate-800"><p class="text-xs text-slate-400 truncate">${getUserName(state.currentUser.id)}</p><p class="text-xs text-slate-500 truncate">${getAreaName(state.currentUser.areaId)}</p></div>` : ''}
                <nav class="flex-1 p-2 overflow-y-auto overflow-x-hidden ${!sbo ? 'px-3 pt-6' : ''}">
                    ${renderMenuSection('trabajo', 'Mi Trabajo', 'briefcase', renderNavItem('send', 'Bandeja de Entrada', 'inbox') + renderNavItem('file-text', 'Mis Borradores', 'drafts'))}
                    ${renderMenuSection('nuevo', 'Nuevo', 'plus-circle', renderNavItem('file-plus', 'Crear Documento', 'create_doc') + renderNavItem('folder-plus', 'Crear Expediente', 'create_exp'))}
                    ${renderMenuSection('consultas', 'Consultas', 'search', renderNavItem('search', 'Buscador', 'search') + renderNavItem('archive', 'Archivo Central', 'archive') + renderNavItem('ban', 'Anulados', 'anulados') + renderNavItem('pie-chart', 'Estadísticas', 'stats'))}
                    ${state.currentUser.role === 'admin' ? renderMenuSection('admin', 'Administración', 'settings', renderNavItem('users', `Usuarios (${state.db.users.length})`, 'admin_users') + renderNavItem('building', `Áreas (${state.db.areas.length})`, 'admin_areas')) : ''}
                </nav>
                <div class="p-4 border-t border-slate-800">
                    <button data-action="logout" class="flex items-center ${sbo ? 'gap-2 justify-start' : 'justify-center'} text-slate-400 hover:text-white w-full transition-colors outline-none" title="Cerrar Sesión"><i data-lucide="log-out"></i> <span class="${sbo ? 'block' : 'hidden'}">Cerrar Sesión</span></button>
                </div>
            </div>
            <div class="flex-1 flex flex-col overflow-hidden relative">
                <header class="bg-white shadow-sm h-14 flex items-center px-6 justify-between shrink-0">
                    <h2 class="text-lg font-semibold text-gray-700 capitalize">${state.selectedItem ? `Detalle de ${state.selectedItem.type}` : state.currentView.replace('_', ' ')}</h2>
                    <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">${getCurrentYear()}</span>
                </header>
                <main class="flex-1 overflow-auto p-6 bg-slate-50/50">${getViewContent()}</main>
                ${renderModalOverlay()}
            </div>
        </div>
    `;
}

function renderNavItem(icon, label, view) {
    const isActive = state.currentView === view && !state.selectedItem; const activeClass = isActive ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white';
    const sbOpen = state.ui.sidebarOpen;
    return `<button data-target-view="${view}" class="w-full flex items-center ${sbOpen ? 'gap-3 px-3' : 'justify-center px-0'} py-2.5 rounded-lg text-sm transition-all duration-200 ${activeClass} outline-none" title="${!sbOpen ? label : ''}"><i data-lucide="${icon}" class="w-5 h-5 shrink-0"></i> <span class="${sbOpen ? 'block' : 'hidden'} truncate">${label}</span></button>`;
}

function getViewContent() {
    if (state.selectedItem) return state.selectedItem.type === 'expediente' ? renderExpedienteDetail() : renderDocumentDetail();
    switch (state.currentView) { case 'inbox': return renderInbox(); case 'drafts': return renderDrafts(); case 'create_doc': return renderCreateDocument(); case 'create_exp': return renderCreateExpediente(); case 'search': return renderSearcher(); case 'archive': return renderArchive(); case 'anulados': return renderAnulados(); case 'stats': return renderStats(); case 'admin_users': return renderAdminUsers(); case 'admin_areas': return renderAdminAreas(); default: return renderInbox(); }
}

function renderLogin() {
    return `<div class="min-h-screen bg-slate-900 flex items-center justify-center p-4"><div class="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-6"><div class="text-center"><div class="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4"><i data-lucide="building" class="text-blue-600 w-8 h-8"></i></div><h2 class="text-2xl font-bold text-gray-900">Sistema GDE</h2></div><div id="login-error" class="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center border border-red-200 hide"></div><form id="form-login" class="space-y-4"><input type="email" id="login-email" value="admin@gde.com" class="w-full px-4 py-2 border rounded-lg outline-none" /><input type="password" id="login-password" value="123" class="w-full px-4 py-2 border rounded-lg outline-none" /><button type="submit" class="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 shadow-md flex items-center justify-center gap-2"><i data-lucide="log-in" class="w-5 h-5"></i> Ingresar al Sistema</button></form></div></div>`;
}

function renderAdminUsers() {
    return `<div class="max-w-6xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative"><div class="absolute top-6 right-6 z-10"><button data-action="export-csv" data-model="admin_users" class="text-xs bg-slate-200 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-300 font-bold flex items-center gap-1"><i data-lucide="download" class="w-3 h-3"></i> Exportar CSV</button></div><h3 class="font-bold text-lg mb-4 flex items-center gap-2"><i data-lucide="users" class="w-5 h-5"></i> ABM de Usuarios (${state.db.users.length})</h3><form id="form-admin-user" class="flex flex-wrap gap-4 mb-6 p-4 bg-slate-50 rounded-lg border"><input required type="text" id="admin-u-name" placeholder="Nombre Completo" class="flex-1 min-w-[150px] px-3 py-2 border rounded outline-none" /><input required type="email" id="admin-u-email" placeholder="Correo Electrónico" class="flex-1 min-w-[150px] px-3 py-2 border rounded outline-none" /><input required type="text" id="admin-u-pass" placeholder="Contraseña" class="w-32 px-3 py-2 border rounded outline-none" /><select id="admin-u-area" class="w-48 px-3 py-2 border rounded outline-none">${state.db.areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}</select><select id="admin-u-role" class="w-32 px-3 py-2 border rounded outline-none"><option value="user">Usuario</option><option value="admin">Admin</option></select><button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"><i data-lucide="plus" class="w-4 h-4"></i> Crear</button></form><div class="overflow-x-auto"><table class="w-full text-left text-sm border-collapse"><thead class="bg-gray-50"><tr class="border-b"><th class="p-2">ID</th><th class="p-2">Nombre</th><th class="p-2">Email</th><th class="p-2">Área</th><th class="p-2">Rol</th><th class="p-2">Acciones</th></tr></thead><tbody class="divide-y">${state.db.users.map(u => `<tr><td class="p-2 text-xs text-gray-500">${u.id}</td><td class="p-2 font-medium">${u.name}</td><td class="p-2">${u.email}</td><td class="p-2">${getAreaName(u.areaId)}</td><td class="p-2 uppercase text-xs">${u.role}</td><td class="p-2"><button data-action="open-modal" data-modal-type="editar_usuario" data-id="${u.id}" class="text-blue-500 hover:text-blue-700 text-xs font-bold mr-3 inline-flex items-center gap-1"><i data-lucide="edit-3" class="w-3 h-3"></i> Editar</button><button data-action="admin-del-user" data-id="${u.id}" class="text-red-500 hover:text-red-700 text-xs font-bold inline-flex items-center gap-1"><i data-lucide="trash-2" class="w-3 h-3"></i> Eliminar</button></td></tr>`).join('')}</tbody></table></div></div>`;
}

function renderAdminAreas() {
    return `<div class="max-w-3xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative"><div class="absolute top-6 right-6 z-10"><button data-action="export-csv" data-model="admin_areas" class="text-xs bg-slate-200 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-300 font-bold flex items-center gap-1"><i data-lucide="download" class="w-3 h-3"></i> Exportar CSV</button></div><h3 class="font-bold text-lg mb-4 flex items-center gap-2"><i data-lucide="building" class="w-5 h-5"></i> ABM de Áreas (${state.db.areas.length})</h3><form id="form-admin-area" class="flex gap-4 mb-6 p-4 bg-slate-50 rounded-lg border"><input required type="text" id="admin-a-name" placeholder="Nombre del Área" class="flex-1 px-3 py-2 border rounded outline-none" /><button type="submit" class="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 flex items-center gap-1"><i data-lucide="plus" class="w-4 h-4"></i> Agregar</button></form><table class="w-full text-left text-sm border-collapse"><thead class="bg-gray-50"><tr class="border-b"><th class="p-2">ID</th><th class="p-2">Nombre</th><th class="p-2 text-center">Usuarios</th><th class="p-2">Acciones</th></tr></thead><tbody class="divide-y">${state.db.areas.map(a => { const uCount = state.db.users.filter(u => u.areaId === a.id).length; return `<tr><td class="p-2 text-xs text-gray-500">${a.id}</td><td class="p-2 font-medium">${a.name}</td><td class="p-2 text-center font-bold text-blue-600">${uCount}</td><td class="p-2"><button data-action="admin-del-area" data-id="${a.id}" class="text-red-500 hover:text-red-700 text-xs font-bold inline-flex items-center gap-1"><i data-lucide="trash-2" class="w-3 h-3"></i> Eliminar</button></td></tr>`; }).join('')}</tbody></table></div>`;
}

function renderInbox() {
    const term = state.searchTerms.inbox;
    const myDocs = state.db.documents.filter(d => isPersonalDoc(d, state.currentUser)).filter(d => filterItem(d, term));
    const myExps = state.db.expedientes.filter(e => isPersonalExp(e, state.currentUser)).filter(e => filterItem(e, term));
    const areaDocs = state.db.documents.filter(d => isAreaDoc(d, state.currentUser) && !isPersonalDoc(d, state.currentUser)).filter(d => filterItem(d, term));
    const areaExps = state.db.expedientes.filter(e => isAreaExp(e, state.currentUser) && !isPersonalExp(e, state.currentUser)).filter(e => filterItem(e, term));
    const isOpenP = state.menus.inboxPersonal; const isOpenA = state.menus.inboxArea;

    return `<div class="space-y-6"><div class="flex bg-white p-3 rounded-xl shadow-sm border border-gray-200"><i data-lucide="search" class="text-gray-400 mr-2"></i><input type="text" data-search-model="inbox" placeholder="Filtrar bandejas (por número, asunto, remitente, etc)..." value="${term}" class="w-full outline-none text-sm" autofocus /></div><div class="bg-white rounded-xl shadow-sm border border-blue-200 overflow-hidden"><button data-action="toggle-menu" data-menu="inboxPersonal" class="w-full px-6 py-4 border-b border-blue-200 bg-blue-50 hover:bg-blue-100 flex justify-between items-center transition-colors outline-none"><h3 class="font-semibold text-blue-900 flex items-center gap-2"><i data-lucide="user" class="w-5 h-5"></i> Mis Trámites (${myDocs.length + myExps.length})</h3><i data-lucide="${isOpenP ? 'chevron-down' : 'chevron-right'}" class="text-blue-900"></i></button><div class="${isOpenP ? 'block' : 'hidden'} p-4 space-y-6"><div><h4 class="font-bold text-gray-700 mb-2 flex items-center gap-2"><i data-lucide="file-text" class="w-4 h-4"></i> Documentos - Bandeja Personal</h4>${renderTable(myDocs, 'inboxDoc', 'No tienes documentos pendientes.')}</div><div><h4 class="font-bold text-gray-700 mb-2 flex items-center gap-2"><i data-lucide="folder-open" class="w-4 h-4"></i> Expedientes - Bandeja Personal</h4>${renderTable(myExps, 'inboxExp', 'No tienes expedientes asignados a ti.', true)}</div></div></div><div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"><button data-action="toggle-menu" data-menu="inboxArea" class="w-full px-6 py-4 border-b border-slate-200 bg-slate-100 hover:bg-slate-200 flex justify-between items-center transition-colors outline-none"><h3 class="font-semibold text-slate-800 flex items-center gap-2"><i data-lucide="users" class="w-5 h-5"></i> Trámites de mi Área (${areaDocs.length + areaExps.length})</h3><i data-lucide="${isOpenA ? 'chevron-down' : 'chevron-right'}" class="text-slate-800"></i></button><div class="${isOpenA ? 'block' : 'hidden'} p-4 space-y-6"><div><h4 class="font-bold text-gray-700 mb-2 flex items-center gap-2"><i data-lucide="file-text" class="w-4 h-4"></i> Documentos del Área</h4>${renderTable(areaDocs, 'areaDoc', 'No hay documentos pendientes de adquirir en el área.', false, true)}</div><div><h4 class="font-bold text-gray-700 mb-2 flex items-center gap-2"><i data-lucide="folder-open" class="w-4 h-4"></i> Expedientes del Área</h4>${renderTable(areaExps, 'areaExp', 'No hay expedientes pendientes de adquirir en el área.', true, true)}</div></div></div></div>`;
}

function renderDrafts() {
    const term = state.searchTerms.drafts;
    const drafts = state.db.documents.filter(d => d.creatorId === state.currentUser.id && (d.status === STATUS.BORRADOR || d.status === STATUS.RECHAZADO) && d.currentOwnerId === state.currentUser.id).filter(d => filterItem(d, term));
    return `<div class="space-y-6"><div class="flex bg-white p-3 rounded-xl shadow-sm border border-gray-200"><i data-lucide="search" class="text-gray-400 mr-2"></i><input type="text" data-search-model="drafts" placeholder="Filtrar borradores..." value="${term}" class="w-full outline-none text-sm" autofocus /></div><div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"><div class="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 class="font-semibold text-gray-800 flex items-center gap-2"><i data-lucide="edit-2" class="w-4 h-4"></i> Mis Borradores (${drafts.length})</h3></div>${renderTable(drafts, 'drafts', 'No tienes borradores.')}</div></div>`;
}

function renderArchive() {
    const term = state.searchTerms.archive;
    const docs = state.db.documents.filter(d => d.status === STATUS.ARCHIVADO && (d.creatorId === state.currentUser.id || d.owners?.includes(state.currentUser.id) || d.owners?.includes(state.currentUser.areaId) || state.db.users.find(u=>u.id===d.creatorId)?.areaId === state.currentUser.areaId)).filter(d => filterItem(d, term));
    const exps = state.db.expedientes.filter(e => e.status === STATUS.ARCHIVADO && canViewExpediente(e, state.currentUser)).filter(e => filterItem(e, term));
    return `<div class="space-y-6"><div class="flex bg-white p-3 rounded-xl shadow-sm border border-gray-200"><i data-lucide="search" class="text-gray-400 mr-2"></i><input type="text" data-search-model="archive" placeholder="Filtrar archivo..." value="${term}" class="w-full outline-none text-sm" autofocus /></div><div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"><div class="px-6 py-4 border-b border-gray-200 bg-stone-100"><h3 class="font-semibold text-stone-800 flex items-center gap-2"><i data-lucide="file-text" class="w-4 h-4"></i> Documentos Archivados (${docs.length})</h3></div>${renderTable(docs, 'archiveDoc', 'No hay documentos archivados.')}</div><div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"><div class="px-6 py-4 border-b border-gray-200 bg-stone-100"><h3 class="font-semibold text-stone-800 flex items-center gap-2"><i data-lucide="folder-open" class="w-4 h-4"></i> Expedientes Archivados (${exps.length})</h3></div>${renderTable(exps, 'archiveExp', 'No hay expedientes archivados.', true)}</div></div>`;
}

function renderAnulados() {
    const term = state.searchTerms.anulados;
    const docs = state.db.documents.filter(d => d.status === STATUS.ANULADO).filter(d => filterItem(d, term));
    const exps = state.db.expedientes.filter(e => e.status === STATUS.ANULADO && canViewExpediente(e, state.currentUser)).filter(e => filterItem(e, term));
    return `<div class="space-y-6"><div class="flex bg-white p-3 rounded-xl shadow-sm border border-gray-200"><i data-lucide="search" class="text-gray-400 mr-2"></i><input type="text" data-search-model="anulados" placeholder="Filtrar anulados..." value="${term}" class="w-full outline-none text-sm" autofocus /></div><div class="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden"><div class="px-6 py-4 border-b border-red-200 bg-red-50"><h3 class="font-semibold text-red-800 flex items-center gap-2"><i data-lucide="file-text" class="w-4 h-4"></i> Documentos Anulados (${docs.length})</h3></div>${renderTable(docs, 'anuladosDoc', 'No hay documentos anulados.')}</div><div class="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden"><div class="px-6 py-4 border-b border-red-200 bg-red-50"><h3 class="font-semibold text-red-800 flex items-center gap-2"><i data-lucide="folder-open" class="w-4 h-4"></i> Expedientes Anulados (${exps.length})</h3></div>${renderTable(exps, 'anuladosExp', 'No hay expedientes anulados.', true)}</div></div>`;
}

function renderSearcher() {
    const term = state.searchTerms.search; const filter = state.searchTerms.globalFilter;
    const searchableDocs = state.db.documents.filter(d => { if ([STATUS.BORRADOR, STATUS.FIRMANDOSE, STATUS.ELIMINADO].includes(d.status)) return false; return state.db.users.find(u => u.id === d.creatorId)?.areaId === state.currentUser.areaId || d.owners?.includes(state.currentUser.id) || d.owners?.includes(state.currentUser.areaId); });
    const searchableExps = state.db.expedientes.filter(e => e.status !== STATUS.ELIMINADO && canViewExpediente(e, state.currentUser));
    const results = [...searchableDocs, ...searchableExps].filter(item => { if (!filterItem(item, term)) return false; if (filter === 'doc' && item.type !== 'documento') return false; if (filter === 'exp' && item.type !== 'expediente') return false; return true; });
    return `<div class="max-w-5xl mx-auto space-y-6"><div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200"><h2 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><i data-lucide="search" class="w-5 h-5"></i> Consulta General</h2><div class="flex gap-4"><input type="text" data-search-model="search" placeholder="Buscar general..." value="${term}" class="flex-1 px-4 py-2 border rounded-lg outline-none focus:border-blue-500" autofocus /><select data-search-model="globalFilter" class="px-4 py-2 border rounded-lg bg-white outline-none"><option value="todos" ${filter === 'todos' ? 'selected' : ''}>Todos</option><option value="doc" ${filter === 'doc' ? 'selected' : ''}>Solo Documentos</option><option value="exp" ${filter === 'exp' ? 'selected' : ''}>Solo Expedientes</option></select></div></div><div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">${renderTable(results, 'search', 'No se encontraron resultados.', filter === 'exp' || filter === 'todos')}</div></div>`;
}

function renderCreateDocument() {
    const term = state.searchTerms.docTypeCreate.toLowerCase();
    const filterOpts = (arr) => arr.filter(t => t.toLowerCase().includes(term) || getDocCode(t).toLowerCase().includes(term));
    const excl = filterOpts(DOC_TYPES.CON_DEST_EXCL); const mult = filterOpts(DOC_TYPES.CON_DEST_MULT); const sin = filterOpts(DOC_TYPES.SIN_DEST);

    return `<div class="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"><div class="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 class="font-semibold text-gray-800 text-lg flex items-center gap-2"><i data-lucide="file-plus" class="w-5 h-5"></i> Nuevo Documento</h3></div><form id="form-create-doc" class="p-6 space-y-6"><div class="grid grid-cols-2 gap-6"><div><label class="block text-sm font-medium text-gray-700 mb-1">Tipo de Documento</label><input type="text" data-search-model="docTypeCreate" placeholder="Buscar tipo o código (ej: ME)..." value="${state.searchTerms.docTypeCreate}" class="w-full px-3 py-2 border rounded-lg outline-none mb-2" autofocus /><select id="create-doc-type" class="w-full px-3 py-2 border rounded-lg outline-none" size="6" required>${excl.length ? `<optgroup label="Con Destinatario (Único)">${excl.map(t => `<option value="${t}">${t} (${getDocCode(t)})</option>`).join('')}</optgroup>` : ''}${mult.length ? `<optgroup label="Con Destinatario (Múltiple)">${mult.map(t => `<option value="${t}">${t} (${getDocCode(t)})</option>`).join('')}</optgroup>` : ''}${sin.length ? `<optgroup label="Sin Destinatario">${sin.map(t => `<option value="${t}">${t} (${getDocCode(t)})</option>`).join('')}</optgroup>` : ''}</select></div><div><label class="block text-sm font-medium text-gray-700 mb-1">Asunto Inicial</label><input required type="text" id="create-doc-subject" class="w-full px-3 py-2 border rounded-lg outline-none" /></div></div><div><label class="block text-sm font-medium text-gray-700 mb-1">Cuerpo del Documento</label><textarea id="create-doc-content" rows="6" class="w-full px-3 py-2 border rounded-lg outline-none font-serif text-gray-700"></textarea></div>
    <div id="dest-container" style="display:none;"><label class="block text-sm font-medium text-gray-700 mb-1">Destinatarios Iniciales (Opcional)</label><input type="text" data-local-search="create-dest" placeholder="Buscar usuarios o áreas..." class="w-full px-3 py-2 border rounded-lg outline-none mb-2" /><div class="max-h-32 overflow-y-auto border rounded p-2 bg-gray-50" id="create-dest-list">${[...state.db.areas.map(a=>({id:a.id, name:`[Área] ${a.name}`})), ...state.db.users.filter(u=>u.id!==state.currentUser.id)].map(u => `<label class="flex items-center gap-2 p-1 text-sm dest-item hover:bg-white cursor-pointer border-b last:border-0"><input type="checkbox" name="create_doc_dest" value="${u.id}"> <span class="dest-text">${u.name}</span></label>`).join('')}</div></div>
    <div class="flex justify-end gap-3 pt-4 border-t"><button type="submit" class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2">Continuar Borrador <i data-lucide="chevron-right" class="w-4 h-4"></i></button></div></form></div>`;
}

function renderCreateExpediente() {
    return `<div class="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"><div class="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2"><i data-lucide="folder-plus" class="text-purple-600 w-5 h-5"></i><h3 class="font-semibold text-gray-800 text-lg">Apertura de Expediente</h3></div><form id="form-create-exp" class="p-6 space-y-6"><div><label class="block text-sm font-medium text-gray-700 mb-1">Carátula / Asunto</label><input required type="text" id="create-exp-subject" class="w-full px-3 py-2 border rounded-lg outline-none" /></div><div class="p-4 bg-purple-50 rounded-lg border border-purple-100"><label class="flex items-center gap-3 cursor-pointer mb-2"><input type="checkbox" id="create-exp-public" checked class="w-5 h-5 text-purple-600 rounded" onchange="document.getElementById('private-auth-box').classList.toggle('hidden', this.checked)" /><div><p class="font-medium text-purple-900">Expediente Público</p><p class="text-xs text-purple-700">Si se desmarca, deberá elegir quién puede verlo.</p></div></label><div id="private-auth-box" class="hidden mt-4 pt-4 border-t border-purple-200"><p class="text-sm font-medium mb-2">Autorizados (además de usted y su área):</p><div class="max-h-40 overflow-y-auto bg-white border rounded p-2 text-sm space-y-1">${state.db.areas.map(a => `<label class="flex items-center gap-2"><input type="checkbox" name="auth_areas" value="${a.id}"> Área: ${a.name}</label>`).join('')}${state.db.users.filter(u=>u.id!==state.currentUser.id).map(u => `<label class="flex items-center gap-2"><input type="checkbox" name="auth_users" value="${u.id}"> Usuario: ${u.name}</label>`).join('')}</div></div></div><div class="flex justify-end pt-4 border-t"><button type="submit" class="px-6 py-2.5 bg-purple-600 text-white rounded-lg font-medium flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i> Generar Expediente</button></div></form></div>`;
}

function renderDocumentDetail() {
    const doc = state.selectedItem;
    const isOwner = doc.currentOwnerId === state.currentUser.id; const isMyTurnToSign = doc.status === STATUS.FIRMANDOSE && isOwner;
    const isBorradorOrRechazado = (doc.status === STATUS.BORRADOR || doc.status === STATUS.RECHAZADO) && isOwner; const canEdit = isBorradorOrRechazado || isMyTurnToSign;
    const isConDestinatario = DOC_TYPES.CON_DEST_MULT.includes(doc.docType) || DOC_TYPES.CON_DEST_EXCL.includes(doc.docType);
    // Variables de estado
    const isSignedOrArchived = doc.status === STATUS.FIRMADO || doc.status === STATUS.ARCHIVADO;
    const isHidden = isHiddenFromInbox(doc, state.currentUser);

    let promotorHTML = '';
    if (isConDestinatario && doc.signedBy && doc.signedBy.length > 0) {
        const lastSignerArea = getAreaName(state.db.users.find(u => u.id === doc.signedBy[doc.signedBy.length - 1].id)?.areaId);
        promotorHTML = `<p><strong>PROMOTOR:</strong> ${lastSignerArea}</p>`;
    }

    const vinculados = state.db.expedientes.filter(e => e.linkedDocs && e.linkedDocs.includes(doc.id));
    const relacionados = (doc.relatedDocs || []).map(did => state.db.documents.find(d => d.id === did)).filter(Boolean);

    return `
        <div class="flex gap-6 max-w-7xl mx-auto h-[calc(100vh-8rem)]">
            <div class="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                <div class="px-8 py-4 border-b border-gray-200 bg-white flex justify-between items-center"><div class="flex items-center gap-3"><span class="font-medium px-3 py-1 rounded-full text-sm ${getTypeColorClass(doc.docType)}">${doc.docType}</span><span class="font-mono text-lg text-gray-700">${doc.number || 'Borrador S/N'}</span></div><span class="px-2.5 py-1 rounded-full text-xs font-medium border ${getBadgeColor(doc.status)}">${doc.status}</span></div>
                <div class="flex-1 overflow-auto p-8 bg-gray-50/50">
                    <div class="max-w-4xl mx-auto bg-white min-h-[700px] shadow-lg border border-gray-300 p-12 flex flex-col relative">
                        ${doc.status === STATUS.ANULADO ? `<div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 z-0"><span class="text-8xl text-red-600 font-black transform -rotate-45 border-8 border-red-600 p-8">ANULADO</span></div>` : ''}
                        <div class="text-sm space-y-2 mb-8 border-b-2 border-gray-800 pb-6 relative z-10">
                            <div class="flex justify-between"><p><strong>TIPO:</strong> ${doc.docType.toUpperCase()}</p><p><strong>FECHA:</strong> ${formatDateOnly(doc.createdAt)}</p></div>
                            ${isConDestinatario ? `${promotorHTML}<p><strong>DESTINATARIOS:</strong> ${doc.recipients.map(id => id.startsWith('a') ? `Área: ${getAreaName(id)}` : getUserName(id)).join(', ') || 'Ninguno'}</p>` : ''}
                            <div class="mt-4 flex items-center gap-2"><label class="font-bold">ASUNTO:</label>${canEdit ? `<input type="text" id="edit-doc-subject" value="${doc.subject}" class="flex-1 p-2 border font-medium outline-none rounded" />` : `<span class="text-lg">${doc.subject}</span>`}</div>
                        </div>
                        <div class="flex-1 relative z-10 mb-12">${canEdit ? `<textarea id="edit-doc-content" class="w-full h-full min-h-[300px] p-2 border outline-none font-serif resize-y leading-relaxed text-gray-800 rounded">${doc.content}</textarea>` : `<div class="font-serif text-lg leading-relaxed text-gray-800 whitespace-pre-wrap">${doc.content}</div>`}</div>
                        ${doc.signedBy && doc.signedBy.length > 0 ? `<div class="mt-8 pt-8 border-t border-gray-300 relative z-10 mb-12 flex justify-center gap-8 flex-wrap">${doc.signedBy.map(s => `<div class="text-center text-emerald-700"><p class="font-serif italic text-2xl mb-1 border-b border-emerald-200 inline-block px-4">Firmado Digitalmente</p><p class="font-bold text-sm text-gray-800">${getUserName(s.id)}</p><p class="text-xs text-gray-600 font-medium">${getAreaName(state.db.users.find(u=>u.id===s.id)?.areaId)}</p></div>`).join('')}</div>` : ''}
                        <div class="mt-auto pt-8 border-t border-gray-200 bg-gray-50 -mx-12 -mb-12 p-8 text-sm">
                            <h4 class="font-bold text-gray-600 mb-4">REFERENCIAS DEL DOCUMENTO</h4>
                            ${vinculados.length > 0 ? `<div class="mb-4"><strong>Vinculado en Expedientes:</strong><ul class="list-disc pl-5 mt-1 text-purple-700">${vinculados.map(e => `<li class="cursor-pointer hover:underline" data-action="view-item" data-id="${e.id}" data-type="expediente">${e.number} - ${e.subject}</li>`).join('')}</ul></div>` : ''}
                            <div class="mb-4"><div class="flex justify-between items-center"><strong>Documentos Relacionados:</strong>${canEdit ? `<button data-action="open-modal" data-modal-type="relacionar_doc" class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 flex items-center gap-1"><i data-lucide="link" class="w-3 h-3"></i> Relacionar Doc</button>` : ''}</div>${relacionados.length > 0 ? `<ul class="list-disc pl-5 mt-1 text-blue-700">${relacionados.map(d => `<li class="flex items-center"><span class="cursor-pointer hover:underline flex-1" data-action="view-item" data-id="${d.id}" data-type="documento">${d.number} - ${d.subject}</span> ${canEdit ? `<button data-action="doc-unrelate" data-id="${d.id}" class="text-red-500 hover:text-red-700 font-bold ml-2" title="Quitar Relación"><i data-lucide="unlink" class="w-3 h-3"></i></button>` : ''}</li>`).join('')}</ul>` : '<p class="text-xs text-gray-500 mt-1">Sin relaciones.</p>'}</div>
                            <h4 class="font-bold text-gray-600 mb-4 mt-8 border-t pt-4">ARCHIVOS ADJUNTOS</h4>
                            <div class="mb-4">
                                ${canEdit ? `
                                    <div class="flex items-center gap-2 mb-4 bg-white p-3 rounded border">
                                        <input type="file" id="file-upload-input" class="text-sm flex-1 cursor-pointer file:mr-4 file:py-1.5 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                                        <button data-action="upload-file" class="bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 hover:bg-blue-700"><i data-lucide="upload" class="w-4 h-4"></i> Subir</button>
                                    </div>
                                ` : ''}
                                <ul class="space-y-2">
                                    ${doc.attachments && doc.attachments.length > 0 ? doc.attachments.map(att => `
                                        <li class="flex items-center justify-between p-3 bg-white border border-gray-200 shadow-sm rounded-lg group">
                                            <button type="button" data-action="download-single-file" data-filename="${att.filename}" data-original="${att.originalname}" class="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-2 text-sm outline-none"><i data-lucide="paperclip" class="w-4 h-4"></i> ${att.originalname} <span class="text-xs text-gray-400 font-normal">(${(att.size / 1024).toFixed(1)} KB)</span></button>
                                            ${canEdit ? `<button type="button" data-action="delete-file" data-filename="${att.filename}" class="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity bg-red-50 p-1.5 rounded outline-none" title="Eliminar archivo"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
                                        </li>
                                    `).join('') : '<p class="text-xs text-gray-500 italic">No hay archivos adjuntos.</p>'}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="w-80 flex flex-col gap-4">
                <div class="flex gap-2">
                    <button data-action="close-detail" class="flex-1 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 flex justify-center items-center gap-2"><i data-lucide="arrow-left" class="w-4 h-4"></i> Volver</button>
                    <button data-action="download-doc-zip" data-id="${doc.id}" class="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex justify-center items-center gap-2" title="Descargar PDF y Adjuntos"><i data-lucide="download" class="w-4 h-4"></i> Descargar</button>
                </div>
                ${(isOwner || isSignedOrArchived) && doc.status !== STATUS.ANULADO ? `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <h3 class="font-semibold text-gray-800 mb-4 flex items-center gap-2"><i data-lucide="zap" class="w-4 h-4"></i> Acciones</h3>
                    <div class="space-y-2">
                        ${isBorradorOrRechazado ? `${isConDestinatario ? `<button data-action="open-modal" data-modal-type="destinatarios" class="w-full py-2 bg-purple-600 text-white rounded text-sm font-medium mb-2 flex items-center justify-center gap-2"><i data-lucide="users" class="w-4 h-4"></i> Destinatarios</button>` : ''}<button data-action="doc-sign-direct" class="w-full py-2 bg-emerald-600 text-white rounded text-sm font-medium flex items-center justify-center gap-2"><i data-lucide="pen-tool" class="w-4 h-4"></i> Firmar Yo Mismo</button><button data-action="open-modal" data-modal-type="enviar_firmar" class="w-full py-2 bg-blue-500 text-white rounded text-sm font-medium flex items-center justify-center gap-2"><i data-lucide="send" class="w-4 h-4"></i> Enviar a Firmar</button><button data-action="open-modal" data-modal-type="revisar" class="w-full py-2 bg-amber-500 text-white rounded text-sm font-medium flex items-center justify-center gap-2"><i data-lucide="eye" class="w-4 h-4"></i> Enviar a Revisar</button><button data-action="doc-delete" class="w-full py-2 bg-red-100 text-red-700 border border-red-200 rounded text-sm font-medium mt-4 flex items-center justify-center gap-2"><i data-lucide="trash-2" class="w-4 h-4"></i> Eliminar Borrador</button>` : ''}
                        ${isMyTurnToSign ? `${isConDestinatario ? `<button data-action="open-modal" data-modal-type="destinatarios" class="w-full py-2 bg-purple-600 text-white rounded text-sm font-medium mb-2 flex items-center justify-center gap-2"><i data-lucide="users" class="w-4 h-4"></i> Actualizar Destinatarios</button>` : ''}<button data-action="doc-sign-pending" class="w-full py-2 bg-emerald-600 text-white rounded text-sm font-medium mb-2 flex items-center justify-center gap-2"><i data-lucide="check-circle" class="w-4 h-4"></i> Aplicar mi Firma</button><button data-action="open-modal" data-modal-type="rechazar_doc" class="w-full py-2 bg-red-500 text-white rounded text-sm font-medium flex items-center justify-center gap-2"><i data-lucide="x-circle" class="w-4 h-4"></i> Rechazar / Devolver</button>` : ''}
                        ${isSignedOrArchived ? `
                        <button data-action="open-modal" data-modal-type="derivar_doc" class="w-full py-2 bg-indigo-600 text-white rounded text-sm font-medium mb-2 flex items-center justify-center gap-2"><i data-lucide="share" class="w-4 h-4"></i> Derivar Documento</button>
                        
                        ${doc.status === STATUS.FIRMADO ? `<button data-action="open-modal" data-modal-type="archivar_doc" class="w-full py-2 bg-stone-600 text-white rounded text-sm font-medium mb-2 flex items-center justify-center gap-2"><i data-lucide="archive" class="w-4 h-4"></i> Archivar Central (Global)</button>` : ''}
                        
                        ${doc.status !== STATUS.ARCHIVADO && doc.status !== STATUS.ANULADO ? `
                            ${isHidden ? 
                                `<button data-action="item-restaurar" class="w-full py-2 bg-emerald-500 text-white rounded text-sm font-medium mb-2 flex items-center justify-center gap-2"><i data-lucide="eye" class="w-4 h-4"></i> Restaurar a mi Bandeja</button>` : 
                                `<button data-action="item-ocultar" class="w-full py-2 bg-gray-500 text-white rounded text-sm font-medium mb-2 flex items-center justify-center gap-2"><i data-lucide="eye-off" class="w-4 h-4"></i> Quitar de mi Bandeja</button>`
                            }
                        ` : ''}

                        <button data-action="open-modal" data-modal-type="anular_doc" class="w-full py-2 bg-slate-800 text-white rounded text-sm font-medium flex items-center justify-center gap-2"><i data-lucide="ban" class="w-4 h-4"></i> Anular Documento</button>
                        ` : ''}
                    </div>
                </div>
                ` : ''}
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex-1 overflow-hidden flex flex-col"><h3 class="font-semibold text-gray-800 mb-4 flex items-center gap-2"><i data-lucide="clock" class="w-4 h-4"></i> Historial</h3><div class="flex-1 overflow-auto pr-2 space-y-4">${[...doc.history].reverse().map(h => `<div class="pl-4 border-l-2 border-blue-200 pb-2"><p class="text-xs font-semibold">${h.action}</p><p class="text-[10px] text-gray-500"><strong>${getUserName(h.userId)}</strong> • ${new Date(h.date).toLocaleString()}</p>${h.notes ? `<p class="text-xs text-gray-600 bg-gray-50 p-1.5 rounded border border-gray-100 mt-1 italic">"${h.notes}"</p>` : ''}</div>`).join('')}</div></div>
            </div>
        </div>
    `;
}

function renderExpedienteDetail() {
    const exp = state.selectedItem;
    const isArchived = exp.status === STATUS.ARCHIVADO; const isAnulado = exp.status === STATUS.ANULADO; const isActive = !isArchived && !isAnulado;
    const isOwnerUser = exp.currentOwnerId === state.currentUser.id; 
    const term = state.searchTerms.expDetail.toLowerCase();
    const linkedDocsList = exp.linkedDocs.map(did => state.db.documents.find(d => d.id === did)).filter(Boolean).filter(d => (d.number||'').toLowerCase().includes(term) || d.subject.toLowerCase().includes(term));

    return `
        <div class="max-w-5xl mx-auto h-[calc(100vh-8rem)] flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div class="px-8 py-6 border-b border-gray-200 bg-purple-50 flex justify-between items-center shrink-0">
                <div class="flex items-center gap-4"><div class="p-3 bg-white rounded-lg shadow-sm text-purple-600"><i data-lucide="folder-open" class="w-8 h-8"></i></div><div><h2 class="text-2xl font-bold">${exp.number}</h2><p class="text-gray-600 font-medium">${exp.subject}</p></div></div>
                <div class="flex items-center gap-4">
                    ${!exp.isPublic ? '<span class="px-3 py-1 rounded-full text-xs font-bold border bg-yellow-100 text-yellow-800">RESERVADO</span>' : ''}${isArchived ? '<span class="px-3 py-1 rounded-full text-sm font-medium border bg-stone-100 text-stone-700">SELLADO / ARCHIVADO</span>' : ''}${isAnulado ? '<span class="px-3 py-1 rounded-full text-sm font-medium border bg-red-100 text-red-700">ANULADO</span>' : ''}<span class="px-3 py-1 rounded-full text-sm font-medium border bg-white">${exp.status}</span>
                    <button data-action="download-exp-zip" data-id="${exp.id}" class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 flex items-center gap-2 font-bold shadow-sm"><i data-lucide="package" class="w-4 h-4"></i> Exportar ZIP</button>
                    <button data-action="close-detail" class="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2"><i data-lucide="arrow-left" class="w-4 h-4"></i> Volver</button>
                </div>
            </div>
            <div class="flex-1 flex overflow-hidden">
                <div class="flex-1 flex flex-col p-6 bg-gray-50 border-r border-gray-200 overflow-hidden">
                    <div class="flex justify-between items-center mb-4 shrink-0"><h3 class="font-semibold text-lg">Fojas (${exp.linkedDocs.length})</h3>${isOwnerUser && isActive ? `<button data-action="open-modal" data-modal-type="vincular_doc" class="px-3 py-1.5 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 flex items-center gap-1"><i data-lucide="link" class="w-4 h-4"></i> Vincular Documentos</button>` : ''}</div>
                    <input type="text" data-search-model="expDetail" placeholder="Buscar foja vinculada..." value="${state.searchTerms.expDetail}" class="w-full px-3 py-2 border rounded-lg text-sm mb-4 outline-none" />
                    <div class="space-y-3 overflow-y-auto flex-1 pr-2">
                        ${linkedDocsList.length === 0 ? '<div class="text-center p-8 bg-white border border-dashed text-gray-400 text-sm rounded-lg">No hay fojas que coincidan con la búsqueda.</div>' : linkedDocsList.map((d) => {
                            const originalIndex = exp.linkedDocs.findIndex(id=>id===d.id) + 1; const isSealed = exp.sealedDocs?.includes(d.id) || isArchived;
                            return `
                            <div class="bg-white p-4 rounded-lg border shadow-sm flex items-center justify-between group">
                                <div class="flex items-center gap-4"><div class="font-bold text-slate-500">${originalIndex}</div><div><p class="font-medium text-blue-700">${d.number}</p><p class="text-sm text-gray-600">${d.subject}</p></div></div>
                                <div class="flex gap-2">
                                    ${isOwnerUser && isActive && !isSealed ? `<button data-action="exp-unlink" data-id="${d.id}" class="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded border border-red-200 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"><i data-lucide="unlink" class="w-3 h-3"></i> Desvincular</button>` : ''}
                                    ${isSealed ? `<span class="px-3 py-1.5 text-xs text-gray-400 bg-gray-100 rounded border">Sellada</span>` : ''}
                                    <button data-action="download-doc-zip" data-id="${d.id}" class="px-2 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs rounded border" title="Descargar Foja"><i data-lucide="download" class="w-3 h-3"></i></button>
                                    <button data-action="view-item" data-id="${d.id}" data-type="documento" class="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs rounded border flex items-center gap-1"><i data-lucide="eye" class="w-3 h-3"></i> Ver</button>
                                </div>
                            </div>
                        `}).join('')}
                    </div>
                </div>
                <div class="w-80 bg-white p-6 overflow-auto flex flex-col">
                    <h4 class="font-semibold mb-4 border-b pb-2">Información</h4>
                    <p class="text-sm mb-6"><span class="text-gray-500 block text-xs">Ubicación Actual</span> <span class="font-medium">${getUserName(exp.currentOwnerId) !== 'Desconocido' ? getUserName(exp.currentOwnerId) : getAreaName(exp.currentOwnerId)}</span></p>
                    ${isOwnerUser && !isAnulado ? `
                        <div class="space-y-2 mb-8">
                            ${!exp.isPublic ? `<button data-action="open-modal" data-modal-type="editar_permisos_exp" class="w-full py-1.5 bg-yellow-50 text-yellow-700 text-sm rounded border border-yellow-200 flex items-center justify-center gap-2"><i data-lucide="shield" class="w-4 h-4"></i> Editar Permisos</button>` : ''}
                            <button data-action="open-modal" data-modal-type="derivar_exp" class="w-full py-1.5 bg-indigo-600 text-white text-sm rounded border flex items-center justify-center gap-2"><i data-lucide="share" class="w-4 h-4"></i> Derivar Expediente</button>
                            ${isActive ? `<button data-action="open-modal" data-modal-type="archivar_exp" class="w-full py-1.5 bg-stone-600 text-white text-sm rounded border flex items-center justify-center gap-2"><i data-lucide="archive" class="w-4 h-4"></i> Archivar (Sellar Fojas)</button><button data-action="open-modal" data-modal-type="anular_exp" class="w-full py-1.5 bg-slate-800 text-white text-sm rounded border mt-4 flex items-center justify-center gap-2"><i data-lucide="ban" class="w-4 h-4"></i> Anular Expediente</button>` : ''}
                            ${isArchived ? `<button data-action="exp-desarchivar" class="w-full py-1.5 bg-amber-500 text-white text-sm rounded border flex items-center justify-center gap-2"><i data-lucide="package-open" class="w-4 h-4"></i> Desarchivar Expediente</button>` : ''}
                        </div>
                    ` : ''}
                    <h4 class="font-semibold mb-4 border-b pb-2 flex items-center gap-2"><i data-lucide="clock" class="w-4 h-4"></i> Movimientos</h4>
                    <div class="flex-1 overflow-auto space-y-4">${[...exp.history].reverse().map(h => `<div class="text-sm border-l-2 border-purple-200 pl-3"><p class="font-medium">${h.action}</p><p class="text-[10px] text-gray-500"><strong>${getUserName(h.userId)}</strong> • ${new Date(h.date).toLocaleString()}</p>${h.notes ? `<p class="text-xs text-gray-600 mt-0.5 italic">"${h.notes}"</p>` : ''}</div>`).join('')}</div>
                </div>
            </div>
        </div>
    `;
}

function renderModalOverlay() {
    if (!state.modal) return '';
    const m = state.modal; let title = '', content = ''; const term = (m.search || '').toLowerCase();
    const mixedList = [...state.db.areas.map(a => ({ id: a.id, name: `[Área] ${a.name}` })), ...state.db.users.filter(u => u.id !== state.currentUser.id).map(u => ({ id: u.id, name: `${u.name} (${getAreaName(u.areaId)})` }))].filter(i => i.name.toLowerCase().includes(term));
    const usersList = state.db.users.filter(u => u.id !== state.currentUser.id && u.name.toLowerCase().includes(term));
    const docsFirmados = state.db.documents.filter(d => (d.status === STATUS.FIRMADO || d.status === STATUS.ARCHIVADO) && d.id !== state.selectedItem?.id && ((d.number||'').toLowerCase().includes(term) || d.subject.toLowerCase().includes(term)));

    if (m.type === 'editar_usuario') {
        title = 'Editar Usuario';
        content = `
            <div class="space-y-3 mb-4">
                <div><label class="text-xs font-bold text-gray-600">Nombre</label><input type="text" data-modal-input="editUName" value="${m.editUName}" class="w-full p-2 border rounded text-sm outline-none" /></div>
                <div><label class="text-xs font-bold text-gray-600">Email</label><input type="email" data-modal-input="editUEmail" value="${m.editUEmail}" class="w-full p-2 border rounded text-sm outline-none" /></div>
                <div><label class="text-xs font-bold text-gray-600">Contraseña</label><input type="text" data-modal-input="editUPass" value="${m.editUPass}" class="w-full p-2 border rounded text-sm outline-none" /></div>
                <div><label class="text-xs font-bold text-gray-600">Área</label><select data-modal-input="editUArea" class="w-full p-2 border rounded text-sm outline-none">${state.db.areas.map(a => `<option value="${a.id}" ${m.editUArea === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}</select></div>
                <div><label class="text-xs font-bold text-gray-600">Rol</label><select data-modal-input="editURole" class="w-full p-2 border rounded text-sm outline-none"><option value="user" ${m.editURole === 'user' ? 'selected' : ''}>Usuario</option><option value="admin" ${m.editURole === 'admin' ? 'selected' : ''}>Admin</option></select></div>
            </div>
        `;
    }
    else if (m.type === 'revisar' || m.type === 'derivar_exp') {
        title = m.type === 'revisar' ? 'Enviar a Revisar' : 'Derivar Expediente';
        const list = m.type === 'derivar_exp' ? mixedList : usersList;
        content = `
            <input type="text" data-modal-input="search" placeholder="Buscar destino único..." value="${m.search}" class="w-full p-2 mb-2 border rounded text-sm outline-none" autofocus />
            <div class="border rounded mb-4 max-h-40 overflow-y-auto bg-gray-50 p-1">${list.map(i => `<label class="flex items-center gap-2 p-2 hover:bg-white cursor-pointer text-sm border-b last:border-0"><input type="radio" name="modal_selection" value="${i.id}" ${m.selectedId === i.id ? 'checked' : ''} data-modal-input="selectedId" /> ${i.name}</label>`).join('')}</div>
            <textarea data-modal-input="note" placeholder="Nota de transferencia (requerida)..." class="w-full p-2 border rounded text-sm outline-none mb-4" rows="3">${m.note}</textarea>
        `;
    } 
    else if (m.type === 'derivar_doc' || m.type === 'enviar_firmar' || m.type === 'destinatarios') {
        const titles = { derivar_doc: 'Derivar Documento', enviar_firmar: 'Seleccionar Firmantes', destinatarios: 'Seleccionar Destinatarios' }; title = titles[m.type];
        const list = m.type === 'derivar_doc' || m.type === 'destinatarios' ? mixedList : usersList;
        content = `
            <input type="text" data-modal-input="search" placeholder="Buscar..." value="${m.search}" class="w-full p-2 mb-2 border rounded text-sm outline-none" autofocus />
            <div class="border rounded mb-4 max-h-40 overflow-y-auto bg-gray-50 p-1">${list.map(u => `<label class="flex items-center gap-2 p-2 hover:bg-white cursor-pointer text-sm border-b last:border-0"><input type="checkbox" value="${u.id}" ${m.selectionArr.includes(u.id) ? 'checked' : ''} data-modal-toggle="selectionArr" /> ${u.name}</label>`).join('')}</div>
            ${m.type !== 'destinatarios' ? `<textarea data-modal-input="note" placeholder="Nota (requerida)..." class="w-full p-2 border rounded text-sm outline-none mb-4" rows="3">${m.note}</textarea>` : ''}
        `;
    }
    else if (m.type === 'editar_permisos_exp') {
        title = 'Editar Permisos del Expediente';
        content = `
            <p class="text-sm font-medium mb-2">Autorizados:</p>
            <div class="max-h-60 overflow-y-auto bg-white border rounded p-2 text-sm space-y-1 mb-4">
                ${state.db.areas.map(a => `<label class="flex items-center gap-2"><input type="checkbox" value="${a.id}" ${m.selectionArr.includes(a.id) ? 'checked' : ''} data-modal-toggle="selectionArr"> Área: ${a.name}</label>`).join('')}
                ${state.db.users.filter(u=>u.id!==state.currentUser.id).map(u => `<label class="flex items-center gap-2"><input type="checkbox" value="${u.id}" ${m.selectionArr.includes(u.id) ? 'checked' : ''} data-modal-toggle="selectionArr"> Usuario: ${u.name}</label>`).join('')}
            </div>
        `;
    }
    else if (m.type === 'vincular_doc' || m.type === 'relacionar_doc') {
        title = m.type === 'vincular_doc' ? 'Vincular Documentos a Expediente' : 'Relacionar Documentos';
        const filteredDocs = m.type === 'vincular_doc' ? docsFirmados.filter(d => !state.selectedItem?.linkedDocs?.includes(d.id)) : docsFirmados.filter(d => !state.selectedItem?.relatedDocs?.includes(d.id));
        content = `
            <input type="text" data-modal-input="search" placeholder="Buscar documento firmado..." value="${m.search}" class="w-full p-2 mb-2 border rounded text-sm outline-none" autofocus />
            <div class="border rounded mb-4 max-h-60 overflow-y-auto bg-gray-50 p-1">
                ${filteredDocs.length === 0 ? '<p class="text-xs text-gray-500 p-2 text-center">No hay documentos disponibles</p>' : filteredDocs.map(d => `
                    <label class="flex items-center gap-2 p-2 hover:bg-white cursor-pointer text-sm border-b last:border-0"><input type="checkbox" value="${d.id}" ${m.selectionArr.includes(d.id) ? 'checked' : ''} data-modal-toggle="selectionArr" /> <div><p class="font-medium text-blue-700">${d.number}</p><p class="text-xs text-gray-500">${d.subject}</p></div></label>
                `).join('')}
            </div>
        `;
    }
    else if (m.type === 'confirmar_firma') {
        title = 'Confirmar Firma Digital';
        content = `
            <div class="mb-4 text-sm text-gray-700 bg-blue-50 p-4 rounded border border-blue-100">
                <p class="font-bold mb-2">¿Está seguro que desea aplicar su firma a este documento?</p>
                <p class="text-xs text-gray-600">Al confirmar, se registrará su identidad, la estampa de tiempo actual y el documento avanzará en su ciclo de vida. Esta acción es irreversible.</p>
            </div>
        `;
    }
    else if (['archivar_doc', 'anular_doc', 'archivar_exp', 'anular_exp', 'rechazar_doc'].includes(m.type)) {
        const titles = { archivar_doc: 'Archivar Documento', anular_doc: 'Anular Documento', archivar_exp: 'Archivar Expediente', anular_exp: 'Anular Expediente', rechazar_doc: 'Rechazar Documento' }; 
        title = titles[m.type];
        content = `<p class="text-sm text-gray-600 mb-2">Ingrese un motivo obligatorio:</p><textarea data-modal-input="note" placeholder="Motivo de la acción..." class="w-full p-2 border rounded text-sm outline-none mb-4" rows="3">${m.note}</textarea>`;
    }

    return `
        <div class="absolute inset-0 bg-slate-900/40 z-50 flex items-center justify-center backdrop-blur-sm">
            <div class="bg-white rounded-xl p-6 w-[500px] shadow-2xl flex flex-col max-h-[90vh]">
                <h3 class="font-bold text-lg mb-4 text-gray-800">${title}</h3>${content}
                <div class="flex justify-end gap-2 mt-auto"><button data-action="close-modal" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancelar</button><button data-action="confirm-modal" class="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Confirmar</button></div>
            </div>
        </div>
    `;
}

// ==========================================
// 8. EVENTOS GLOBALES (DELEGACIÓN)
// ==========================================
async function syncData(item, type, historyEntry = null) {
    const url = type === 'expediente' ? `http://localhost:3000/api/exps/update/${item.id}` : `http://localhost:3000/api/docs/update/${item.id}`;
    try {
        await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` },
            body: JSON.stringify({ item, historyEntry }) 
        });
    } catch (err) { console.error("Error sincronizando", err); }
}

document.addEventListener('input', (e) => {
    if (e.target.hasAttribute('data-search-model')) { const model = e.target.getAttribute('data-search-model'); state.searchTerms[model] = e.target.value; activeInputSelector = `[data-search-model="${model}"]`; renderApp(); }
    if (e.target.hasAttribute('data-modal-input')) { const key = e.target.getAttribute('data-modal-input'); state.modal[key] = e.target.value; if (key === 'search') { activeInputSelector = `[data-modal-input="search"]`; renderApp(); } }
    if (e.target.hasAttribute('data-local-search')) { const term = e.target.value.toLowerCase(); document.querySelectorAll('.dest-item').forEach(lbl => { const text = lbl.querySelector('.dest-text').textContent.toLowerCase(); lbl.style.display = text.includes(term) ? 'flex' : 'none'; }); }
});

document.addEventListener('change', (e) => {
    if (e.target.hasAttribute('data-modal-toggle')) { const key = e.target.getAttribute('data-modal-toggle'); const val = e.target.value; if (e.target.checked) state.modal[key].push(val); else state.modal[key] = state.modal[key].filter(v => v !== val); }
    if (e.target.hasAttribute('data-modal-input')) { state.modal[e.target.getAttribute('data-modal-input')] = e.target.value; }
    if (e.target.hasAttribute('data-stats-filter-multi')) { const key = e.target.getAttribute('data-stats-filter-multi'); const values = Array.from(e.target.selectedOptions).map(o => o.value); state.statsOpts[key] = values.includes('all') && e.target.value === 'all' ? ['all'] : values.filter(v => v !== 'all'); if (state.statsOpts[key].length === 0) state.statsOpts[key] = ['all']; renderApp(); }
    if (e.target.hasAttribute('data-stats-filter')) { state.statsOpts[e.target.getAttribute('data-stats-filter')] = e.target.value; renderApp(); }
    if (e.target.id === 'create-doc-type') { const isConDest = DOC_TYPES.CON_DEST_MULT.includes(e.target.value) || DOC_TYPES.CON_DEST_EXCL.includes(e.target.value); const destC = document.getElementById('dest-container'); if (destC) destC.style.display = isConDest ? 'block' : 'none'; }
});

document.addEventListener('submit', async (e) => {
    if (e.target.id === 'form-login') {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');

        try {
            const response = await fetch('http://localhost:3000/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
            });

            if (!response.ok) throw new Error('Credenciales invalidas');

            const data = await response.json();
            data.user.areaId = data.user.area_id;
            localStorage.setItem('gde_token', data.token);

            const sysResponse = await fetch('http://localhost:3000/api/system/init', {
                method: 'GET', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.token}` }
            });

            if (!sysResponse.ok) throw new Error('Error al cargar datos del sistema');
            const sysData = await sysResponse.json();

            state.db.areas = sysData.areas;
            state.db.users = sysData.users;
            
            const docsResponse = await fetch('http://localhost:3000/api/docs/all', { headers: { 'Authorization': `Bearer ${data.token}` } });
            state.db.documents = await docsResponse.json();

            const expsResponse = await fetch('http://localhost:3000/api/exps/all', { headers: { 'Authorization': `Bearer ${data.token}` } });
            state.db.expedientes = await expsResponse.json();

            errorDiv.classList.add('hide');
            setState({ currentUser: data.user, currentView: 'inbox', selectedItem: null });

        } catch (error) {
            console.error(error);
            errorDiv.textContent = 'Credenciales invalidas o error de servidor.';
            errorDiv.classList.remove('hide');
        }
    }
    else if (e.target.id === 'form-create-doc') {
        e.preventDefault();
        const type = document.getElementById('create-doc-type').value;
        const dests = DOC_TYPES.CON_DEST_MULT.includes(type) || DOC_TYPES.CON_DEST_EXCL.includes(type) ? Array.from(document.querySelectorAll('input[name="create_doc_dest"]:checked')).map(el => el.value) : [];
        if (DOC_TYPES.CON_DEST_EXCL.includes(type) && dests.length > 1) return alert("Este documento SOLO admite 1 destinatario inicial (area o usuario).");
        
        const contentHTML = window.tinymce && tinymce.get('create-doc-content') ? tinymce.get('create-doc-content').getContent() : document.getElementById('create-doc-content').value;

        const newDoc = {
            id: `doc_${Date.now()}`, docType: type, subject: document.getElementById('create-doc-subject').value, 
            content: contentHTML, // <-- Usamos el HTML capturado
            creatorId: state.currentUser.id, currentOwnerId: state.currentUser.id, owners: [state.currentUser.id], status: STATUS.BORRADOR, recipients: dests, attachments: []
        };

        fetch('http://localhost:3000/api/docs/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` }, body: JSON.stringify(newDoc)
        }).then(async res => {
            if(res.ok) {
                state.db.documents.push({
                    ...newDoc, type: 'documento', number: null, createdAt: new Date().toISOString(), signatories: [], relatedDocs: [], signedBy: [], attachments: [], 
                    history: [createHistoryEntry(state.currentUser.id, 'Creacion', 'Se genero borrador')]
                });
                setState({ currentView: 'drafts' });
            } else { const errData = await res.json(); alert(`Error del servidor: ${errData.message}`); }
        });
    }
    else if (e.target.id === 'form-create-exp') {
        e.preventDefault(); 
        const isPublic = document.getElementById('create-exp-public').checked; 
        const authAreas = isPublic ? [] : Array.from(document.querySelectorAll('input[name="auth_areas"]:checked')).map(el => el.value); 
        const authUsers = isPublic ? [] : Array.from(document.querySelectorAll('input[name="auth_users"]:checked')).map(el => el.value);
        const expNumber = generateNumber('EX', getAreaName(state.currentUser.areaId));
        
        const newExp = {
            id: `exp_${Date.now()}`, number: expNumber, subject: document.getElementById('create-exp-subject').value, 
            creatorId: state.currentUser.id, currentOwnerId: state.currentUser.id, status: 'En Tramite', isPublic: isPublic, authAreas: authAreas, authUsers: authUsers
        };

        fetch('http://localhost:3000/api/exps/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` }, body: JSON.stringify(newExp)
        }).then(async res => {
            if(res.ok) {
                state.db.expedientes.push({
                    ...newExp, type: 'expediente', linkedDocs: [], sealedDocs: [], createdAt: new Date().toISOString(), 
                    history: [createHistoryEntry(state.currentUser.id, 'Apertura', 'Expediente inicializado')]
                }); 
                setState({ currentView: 'inbox' });
            } else { const errData = await res.json(); alert(`Error del servidor: ${errData.message}`); }
        });
    }
    else if (e.target.id === 'form-admin-area') { 
        e.preventDefault(); 
        const id = `a${Date.now()}`; const name = document.getElementById('admin-a-name').value;
        fetch('http://localhost:3000/api/areas/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` }, body: JSON.stringify({ id, name })
        }).then(res => { if(res.ok) { state.db.areas.push({ id, name }); setState({}); } });
    }
    else if (e.target.id === 'form-admin-user') {
        e.preventDefault(); 
        const newUser = { id: `u${Date.now()}`, name: document.getElementById('admin-u-name').value, email: document.getElementById('admin-u-email').value, areaId: document.getElementById('admin-u-area').value, role: document.getElementById('admin-u-role').value, password: document.getElementById('admin-u-pass').value }; 
        fetch('http://localhost:3000/api/users/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` }, body: JSON.stringify(newUser)
        }).then(res => { if(res.ok) { state.db.users.push(newUser); setState({}); } });
    }
});

document.addEventListener('click', async (e) => {
    const thSort = e.target.closest('th[data-sort]');
    if (thSort) { const model = thSort.getAttribute('data-sort'); const field = thSort.getAttribute('data-field'); if (state.sort[model].field === field) state.sort[model].order = state.sort[model].order === 'asc' ? 'desc' : 'asc'; else { state.sort[model].field = field; state.sort[model].order = 'asc'; } return renderApp(); }

    const navBtn = e.target.closest('[data-target-view]');
    if (navBtn) return setState({ currentView: navBtn.getAttribute('data-target-view'), selectedItem: null, modal: null });

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        
        if (action === 'toggle-sidebar') { state.ui.sidebarOpen = !state.ui.sidebarOpen; return setState({}); }
        if (action === 'set-stats-tab') { state.statsOpts.tab = actionBtn.getAttribute('data-tab'); return renderApp(); }
        if (action === 'set-chart-type') { state.statsOpts.chartType = actionBtn.getAttribute('data-type'); return renderApp(); }
        if (action === 'export-csv') return handleExport(actionBtn.getAttribute('data-model'));
        if (action === 'toggle-menu') { state.menus[actionBtn.getAttribute('data-menu')] = !state.menus[actionBtn.getAttribute('data-menu')]; return setState({}); }
        if (action === 'logout') { localStorage.removeItem('gde_token'); return setState({ currentUser: null, currentView: 'inbox', selectedItem: null }); }

        if (action === 'download-doc-zip') {
            actionBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>';
            await downloadDocumentArchive(actionBtn.getAttribute('data-id'));
            renderApp(); // Repinta para restaurar el botón a la normalidad
            return;
        }

        if (action === 'download-exp-zip') {
            actionBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Generando...';
            await downloadFullExpediente(actionBtn.getAttribute('data-id'));
            renderApp();
            return;
        }
        
        if (action === 'close-detail') {
            if (state.selectedItem && state.selectedItem.parentId) {
                const parentColl = state.selectedItem.parentType === 'expediente' ? state.db.expedientes : state.db.documents;
                const parent = parentColl.find(x => x.id === state.selectedItem.parentId);
                if (parent) return setState({ selectedItem: { ...parent, type: state.selectedItem.parentType } });
            }
            return setState({ selectedItem: null });
        }
        
        if (action === 'view-item') {
            const type = actionBtn.getAttribute('data-type'); const item = (type === 'expediente' ? state.db.expedientes : state.db.documents).find(i => i.id === actionBtn.getAttribute('data-id'));
            if (item && type === 'expediente' && !canViewExpediente(item, state.currentUser)) return alert("Acceso denegado. Expediente reservado.");
            if (item) return setState({ selectedItem: { ...item, type, parentId: state.selectedItem?.id, parentType: state.selectedItem?.type } });
        }
        
        if (action === 'acquire-item') {
            const type = actionBtn.getAttribute('data-type'); const item = (type === 'expediente' ? state.db.expedientes : state.db.documents).find(i => i.id === actionBtn.getAttribute('data-id'));
            if (item) { 
                if (type === 'expediente') item.currentOwnerId = state.currentUser.id; else { item.owners = item.owners.filter(oId => oId !== state.currentUser.areaId); item.owners.push(state.currentUser.id); } 
                const hEntry = createHistoryEntry(state.currentUser.id, 'Adquirido', 'Tomado desde la bandeja del area');
                item.history.push(hEntry); 
                await syncData(item, type, hEntry);
                setState({}); 
            } return;
        }

        if (action === 'upload-file') {
            e.preventDefault();
            const fileInput = document.getElementById('file-upload-input');
            if (!fileInput.files || fileInput.files.length === 0) return alert("Seleccione un archivo primero.");
            
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);

            fetch(`http://localhost:3000/api/docs/${state.selectedItem.id}/attach`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` },
                body: formData 
            }).then(async res => {
                if (res.ok) {
                    const data = await res.json();
                    
                    // Solo actualizamos la memoria central (el espejo se actualiza solo)
                    const docIdx = state.db.documents.findIndex(d => d.id === state.selectedItem.id);
                    if (docIdx > -1) {
                        if(!state.db.documents[docIdx].attachments) state.db.documents[docIdx].attachments = [];
                        state.db.documents[docIdx].attachments.push(data.attachment);
                        state.db.documents[docIdx].history.push(createHistoryEntry(state.currentUser.id, 'Archivo Adjuntado', fileInput.files[0].name));
                        
                        state.selectedItem = state.db.documents[docIdx]; // Refrescamos el espejo
                    }
                    setState({});
                } else { alert("Error al subir el archivo."); }
            });
            return;
        }

        if (action === 'delete-file') {
            e.preventDefault();
            if (!confirm('¿Seguro que desea eliminar este archivo adjunto?')) return;
            const filename = actionBtn.getAttribute('data-filename');
            fetch(`http://localhost:3000/api/docs/${state.selectedItem.id}/attach/${filename}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` }
            }).then(res => {
                if (res.ok) {
                    const originalName = state.selectedItem.attachments.find(a => a.filename === filename)?.originalname || filename;
                    
                    // Solo actualizamos la memoria central
                    const docIdx = state.db.documents.findIndex(d => d.id === state.selectedItem.id);
                    if (docIdx > -1) {
                        state.db.documents[docIdx].attachments = state.db.documents[docIdx].attachments.filter(a => a.filename !== filename);
                        state.db.documents[docIdx].history.push(createHistoryEntry(state.currentUser.id, 'Archivo Eliminado', originalName));
                        
                        state.selectedItem = state.db.documents[docIdx]; // Refrescamos el espejo
                    }
                    setState({});
                } else { alert("Error al eliminar el archivo."); }
            });
            return;
        }

        if (action === 'download-single-file') {
            e.preventDefault();
            const filename = actionBtn.getAttribute('data-filename');
            const originalName = actionBtn.getAttribute('data-original');
            
            // Le ponemos un spinner al botón para que el usuario sepa que está descargando
            const originalHtml = actionBtn.innerHTML;
            actionBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Descargando...';
            
            fetch(`http://localhost:3000/api/docs/download/${filename}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` }
            }).then(async res => {
                actionBtn.innerHTML = originalHtml; // Restauramos el botón
                if (window.lucide) lucide.createIcons();
                
                if (res.ok) {
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = originalName; 
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                } else {
                    alert("Error: Sesión expirada o archivo no encontrado.");
                }
            });
            return;
        }

        if (action === 'admin-del-user') { 
            if(confirm('¿Eliminar usuario?')) { 
                const id = actionBtn.getAttribute('data-id');
                fetch(`http://localhost:3000/api/users/delete/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` } 
                }).then(res => { if(res.ok) { state.db.users = state.db.users.filter(u => u.id !== id); setState({}); } });
            } 
            return; 
        }
        if (action === 'admin-del-area') { 
            if(confirm('¿Eliminar area?')) { 
                const id = actionBtn.getAttribute('data-id');
                fetch(`http://localhost:3000/api/areas/delete/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` } 
                }).then(res => { 
                    if(res.ok) { state.db.areas = state.db.areas.filter(a => a.id !== id); setState({}); } 
                    else { alert("No se puede eliminar un area que contiene usuarios registrados."); } 
                });
            } 
            return; 
        }
        
        const saveEdits = async () => {
            if (state.selectedItem && (state.selectedItem.status === STATUS.BORRADOR || state.selectedItem.status === STATUS.RECHAZADO || state.selectedItem.status === STATUS.FIRMANDOSE)) {
                const docIdx = state.db.documents.findIndex(d => d.id === state.selectedItem.id);
                if (docIdx > -1) { 
                    state.db.documents[docIdx].subject = document.getElementById('edit-doc-subject').value; 
                    
                    const htmlContent = window.tinymce && tinymce.get('edit-doc-content') 
                        ? tinymce.get('edit-doc-content').getContent() 
                        : document.getElementById('edit-doc-content').value;
                        
                    state.db.documents[docIdx].content = htmlContent; 
                    await syncData(state.db.documents[docIdx], 'documento');
                }
            }
        };

        if (action === 'open-modal') {
            await saveEdits(); const type = actionBtn.getAttribute('data-modal-type'); let mState = { type, search: '', selectedId: null, selectionArr: [], note: '' };
            if (type === 'destinatarios') mState.selectionArr = [...state.selectedItem.recipients];
            if (type === 'editar_permisos_exp') mState.selectionArr = [...state.selectedItem.authAreas, ...state.selectedItem.authUsers];
            if (type === 'editar_usuario') { const u = state.db.users.find(x => x.id === actionBtn.getAttribute('data-id')); mState.editUId = u.id; mState.editUName = u.name; mState.editUEmail = u.email; mState.editUPass = u.password; mState.editUArea = u.areaId; mState.editURole = u.role; }
            return setState({ modal: mState });
        }

        if (action === 'close-modal') return setState({ modal: null });

        if (action === 'confirm-modal') {
            const m = state.modal;
            
            if (m.type === 'editar_usuario') {
                if (!m.editUName || !m.editUEmail || !m.editUPass) return alert("Complete todos los campos.");
                const updatedUser = { name: m.editUName, email: m.editUEmail, password: m.editUPass, areaId: m.editUArea, role: m.editURole };
                
                fetch(`http://localhost:3000/api/users/update/${m.editUId}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` }, body: JSON.stringify(updatedUser)
                }).then(res => {
                    if (res.ok) {
                        const uIdx = state.db.users.findIndex(u => u.id === m.editUId);
                        if (uIdx > -1) { state.db.users[uIdx] = { ...state.db.users[uIdx], ...updatedUser }; }
                        setState({ modal: null });
                    } else { alert("Error al actualizar el usuario en la BD"); }
                });
                return;
            }

            const isExp = state.selectedItem.type === 'expediente';
            const itemIdx = isExp ? state.db.expedientes.findIndex(e => e.id === state.selectedItem.id) : state.db.documents.findIndex(d => d.id === state.selectedItem.id);
            const item = isExp ? state.db.expedientes[itemIdx] : state.db.documents[itemIdx];

            if (m.type === 'destinatarios') { 
                if (DOC_TYPES.CON_DEST_EXCL.includes(item.docType) && m.selectionArr.length !== 1) return alert("Este documento SOLO admite 1 destinatario (area o usuario).");
                item.recipients = [...m.selectionArr]; state.selectedItem.recipients = [...m.selectionArr]; 
                await syncData(item, 'documento'); return setState({ modal: null }); 
            }
            if (m.type === 'editar_permisos_exp') { 
                item.authAreas = m.selectionArr.filter(id => id.startsWith('a')); item.authUsers = m.selectionArr.filter(id => id.startsWith('u')); 
                await syncData(item, 'expediente'); return setState({ modal: null }); 
            }

            if (m.type === 'revisar' || m.type === 'derivar_exp') {
                if (!m.selectedId) return alert("Seleccione un destino."); if (!m.note.trim()) return alert("Ingrese un motivo.");
                item.currentOwnerId = m.selectedId; if (m.type === 'revisar') item.status = STATUS.BORRADOR;
                if (m.type === 'derivar_exp') item.sealedDocs = [...new Set([...(item.sealedDocs || []), ...item.linkedDocs])];
                const destName = m.selectedId.startsWith('a') ? `Area: ${getAreaName(m.selectedId)}` : getUserName(m.selectedId);
                const hAction = m.type === 'revisar' ? `Enviado a Revisar a ${destName}` : `Derivado a ${destName}`;
                
                const hEntry = createHistoryEntry(state.currentUser.id, hAction, m.note);
                item.history.push(hEntry);
                await syncData(item, isExp ? 'expediente' : 'documento', hEntry);
                return setState({ modal: null, selectedItem: null, currentView: 'inbox' });
            }

            if (m.type === 'enviar_firmar') {
                if (m.selectionArr.length === 0) return alert("Seleccione al menos un firmante."); if (!m.note.trim()) return alert("Ingrese un motivo.");
                item.signatories = m.selectionArr; item.status = STATUS.FIRMANDOSE; item.currentOwnerId = item.signatories[0];
                const destNames = m.selectionArr.map(id => getUserName(id)).join(', ');
                
                const hEntry = createHistoryEntry(state.currentUser.id, `Enviado a firmar a ${destNames}`, m.note);
                item.history.push(hEntry);
                await syncData(item, 'documento', hEntry); 
                return setState({ modal: null, selectedItem: null, currentView: 'inbox' });
            }

            if (m.type === 'derivar_doc') {
                if (m.selectionArr.length === 0) return alert("Seleccione al menos un destino."); if (!m.note.trim()) return alert("Ingrese un motivo.");
                item.owners = [...new Set([...(item.owners || []), ...m.selectionArr])];
                const destNames = m.selectionArr.map(id => id.startsWith('a') ? `Area: ${getAreaName(id)}` : getUserName(id)).join(', ');
                
                const hEntry = createHistoryEntry(state.currentUser.id, `Derivado a ${destNames}`, m.note);
                item.history.push(hEntry); 
                await syncData(item, 'documento', hEntry); 
                return setState({ modal: null, selectedItem: null, currentView: 'inbox' });
            }
            
            if (m.type === 'vincular_doc') {
                if (m.selectionArr.length === 0) return alert("Seleccione al menos un documento.");
                for (let docId of m.selectionArr) {
                    const doc = state.db.documents.find(d => d.id === docId);
                    if (!item.linkedDocs.includes(doc.id)) {
                        item.linkedDocs.push(doc.id); 
                        
                        const hEntryExp = createHistoryEntry(state.currentUser.id, 'Foja Vinculada', `Nro: ${doc.number}`);
                        item.history.push(hEntryExp);
                        
                        const hEntryDoc = createHistoryEntry(state.currentUser.id, 'Vinculado a Expediente', `Exp: ${item.number}`);
                        doc.history.push(hEntryDoc);
                        
                        await syncData(doc, 'documento', hEntryDoc); 
                        await syncData(item, 'expediente', hEntryExp); 
                    }
                }
                state.selectedItem.linkedDocs = item.linkedDocs; 
                return setState({ modal: null });
            }

            if (m.type === 'relacionar_doc') {
                if (m.selectionArr.length === 0) return alert("Seleccione al menos un documento.");
                for (let docId of m.selectionArr) {
                    const doc2 = state.db.documents.find(d => d.id === docId);
                    if (!item.relatedDocs) item.relatedDocs = []; 
                    if (!item.relatedDocs.includes(doc2.id)) item.relatedDocs.push(doc2.id);
                }
                state.selectedItem.relatedDocs = item.relatedDocs; 
                await syncData(item, 'documento'); return setState({ modal: null });
            }

            if (['archivar_doc', 'anular_doc', 'archivar_exp', 'anular_exp', 'rechazar_doc'].includes(m.type)) {
                if (!m.note.trim()) return alert("Ingrese un motivo obligatorio.");
                let newStatus = ''; let actionName = '';
                if (m.type.includes('archivar')) { newStatus = STATUS.ARCHIVADO; actionName = 'Archivado'; }
                if (m.type.includes('anular')) { newStatus = STATUS.ANULADO; actionName = 'Anulado'; }
                if (m.type === 'rechazar_doc') { newStatus = STATUS.RECHAZADO; actionName = 'Rechazado'; item.currentOwnerId = item.creatorId; }
                
                item.status = newStatus; 
                if (m.type === 'archivar_exp') item.sealedDocs = [...new Set([...(item.sealedDocs || []), ...item.linkedDocs])];
                
                const hEntry = createHistoryEntry(state.currentUser.id, actionName, m.note);
                item.history.push(hEntry);
                await syncData(item, isExp ? 'expediente' : 'documento', hEntry);
                return setState({ modal: null, selectedItem: null, currentView: m.type.includes('archivar') ? 'archive' : 'inbox' });
            }
            if (action === 'doc-desarchivar') {
                const hEntry = createHistoryEntry(state.currentUser.id, 'Desarchivado', 'Recuperado a la bandeja personal');
                item.history.push(hEntry);
                await syncData(item, 'documento', hEntry);
                return setState({ selectedItem: null, currentView: 'inbox' });
            }
            if (m.type === 'confirmar_firma') {
                if (!item.signedBy) item.signedBy = []; 
                item.signedBy.push({ id: state.currentUser.id, date: new Date().toISOString() });

                if (m.signAction === 'doc-sign-pending') {
                    item.signatories = (item.signatories || []).filter(id => id !== state.currentUser.id);
                    if (item.signatories.length > 0) {
                        item.currentOwnerId = item.signatories[0]; 
                        const hEntry = createHistoryEntry(state.currentUser.id, 'Firma Aplicada', 'Pasa al siguiente firmante');
                        item.history.push(hEntry);
                        await syncData(item, 'documento', hEntry); 
                        return setState({ modal: null, selectedItem: null, currentView: 'inbox' });
                    }
                }

                item.status = STATUS.FIRMADO; 
                if (!item.number) item.number = generateNumber(item.docType, getAreaName(state.currentUser.areaId));

                if (item.relatedDocs && item.relatedDocs.length > 0) {
                    for (let relId of item.relatedDocs) { 
                        const targetDoc = state.db.documents.find(d => d.id === relId); 
                        if (targetDoc) { 
                            if (!targetDoc.relatedDocs) targetDoc.relatedDocs = []; 
                            if (!targetDoc.relatedDocs.includes(item.id)) targetDoc.relatedDocs.push(item.id); 
                            await syncData(targetDoc, 'documento'); 
                        } 
                    }
                }

                const isConDest = DOC_TYPES.CON_DEST_MULT.includes(item.docType) || DOC_TYPES.CON_DEST_EXCL.includes(item.docType);
                if (isConDest) {
                    let fU = new Set(); 
                    item.recipients.forEach(r => { 
                        if (r.startsWith('u')) fU.add(r); 
                        if (r.startsWith('a')) state.db.users.filter(u => u.areaId === r).forEach(u => fU.add(u.id)); 
                    });
                    item.owners = Array.from(fU);
                } else { 
                    item.owners = [item.creatorId]; 
                }

                const hEntry = createHistoryEntry(state.currentUser.id, m.signAction === 'doc-sign-direct' ? 'Firma Directa' : 'Firma Completa', 'Documento sellado digitalmente');
                item.history.push(hEntry);
                await syncData(item, 'documento', hEntry); 
                return setState({ modal: null, selectedItem: null, currentView: 'inbox' });
            }
        }

        if (state.selectedItem) {
            const isExp = state.selectedItem.type === 'expediente';
            const itemIdx = isExp ? state.db.expedientes.findIndex(e => e.id === state.selectedItem.id) : state.db.documents.findIndex(d => d.id === state.selectedItem.id);
            const item = isExp ? state.db.expedientes[itemIdx] : state.db.documents[itemIdx];

            if (action === 'doc-sign-direct' || action === 'doc-sign-pending') {
                await saveEdits(); 
                const isConDest = DOC_TYPES.CON_DEST_MULT.includes(item.docType) || DOC_TYPES.CON_DEST_EXCL.includes(item.docType);
                if (isConDest && (!item.recipients || item.recipients.length === 0)) return alert("Añada al menos un destinatario.");
                if (DOC_TYPES.CON_DEST_EXCL.includes(item.docType) && item.recipients.length !== 1) return alert("Este documento SOLO admite 1 destinatario (área o usuario).");
                
                // Interceptamos la ejecución directa y abrimos el modal, guardando la acción original
                return setState({ modal: { type: 'confirmar_firma', signAction: action } });
            }
            else if (action === 'doc-delete') {
                e.preventDefault();
                if (!confirm('¿Seguro que desea eliminar este borrador de forma permanente? Se eliminarán también todos sus archivos adjuntos del servidor.')) return;
                
                const originalHtml = actionBtn.innerHTML;
                actionBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Eliminando...';
                
                fetch(`http://localhost:3000/api/docs/delete/${state.selectedItem.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('gde_token')}` }
                }).then(async res => {
                    if (res.ok) {
                        // Quitamos el documento de la memoria principal visual
                        state.db.documents = state.db.documents.filter(d => d.id !== state.selectedItem.id);
                        // Volvemos a la bandeja de borradores
                        setState({ selectedItem: null, currentView: 'drafts' });
                    } else {
                        actionBtn.innerHTML = originalHtml;
                        if (window.lucide) lucide.createIcons();
                        alert("Error al eliminar el borrador.");
                    }
                });
                return;
            }
            else if (action === 'doc-unrelate') { 
                if (!confirm('¿Seguro que desea eliminar esta relación?')) return; 
                const docId = actionBtn.getAttribute('data-id'); 
                item.relatedDocs = item.relatedDocs.filter(id => id !== docId); state.selectedItem.relatedDocs = item.relatedDocs; 
                await syncData(item, 'documento'); setState({}); 
            }
            else if (action === 'exp-desarchivar') { 
                item.status = 'En Tramite'; 
                const hEntry = createHistoryEntry(state.currentUser.id, 'Desarchivado', 'Se recuperó el expediente para nuevo tramite');
                item.history.push(hEntry); 
                await syncData(item, 'expediente', hEntry); setState({ selectedItem: null, currentView: 'archive' }); 
            }
            if (action === 'item-ocultar') {
                const isExp = state.selectedItem.type === 'expediente';
                const itemIdx = isExp ? state.db.expedientes.findIndex(e => e.id === state.selectedItem.id) : state.db.documents.findIndex(d => d.id === state.selectedItem.id);
                const item = isExp ? state.db.expedientes[itemIdx] : state.db.documents[itemIdx];

                const hEntry = createHistoryEntry(state.currentUser.id, 'Ocultado', 'Quitado de la bandeja personal');
                item.history.push(hEntry);
                await syncData(item, isExp ? 'expediente' : 'documento', hEntry);
                return setState({ selectedItem: null, currentView: 'inbox' });
            }

            if (action === 'item-restaurar') {
                const isExp = state.selectedItem.type === 'expediente';
                const itemIdx = isExp ? state.db.expedientes.findIndex(e => e.id === state.selectedItem.id) : state.db.documents.findIndex(d => d.id === state.selectedItem.id);
                const item = isExp ? state.db.expedientes[itemIdx] : state.db.documents[itemIdx];

                const hEntry = createHistoryEntry(state.currentUser.id, 'Restaurado', 'Recuperado a la bandeja personal');
                item.history.push(hEntry);
                await syncData(item, isExp ? 'expediente' : 'documento', hEntry);
                return setState({}); // Simplemente repinta para cambiar los botones
            }
            else if (action === 'exp-unlink') {
                const docId = actionBtn.getAttribute('data-id'); item.linkedDocs = item.linkedDocs.filter(id => id !== docId); state.selectedItem.linkedDocs = item.linkedDocs;
                const doc = state.db.documents.find(d => d.id === docId); 
                
                const hEntryExp = createHistoryEntry(state.currentUser.id, 'Foja Desvinculada', `Nro: ${doc.number}`);
                item.history.push(hEntryExp); 
                
                const hEntryDoc = createHistoryEntry(state.currentUser.id, 'Desvinculado de Expediente', `Exp: ${item.number}`);
                doc.history.push(hEntryDoc); 
                
                await syncData(doc, 'documento', hEntryDoc); await syncData(item, 'expediente', hEntryExp); setState({});
            }
        }
        return;
    }

    const tr = e.target.closest('tr[data-id]');
    if (tr) {
        const type = tr.getAttribute('data-type') || (tr.getAttribute('data-id').startsWith('exp') ? 'expediente' : 'documento');
        const item = (type === 'expediente' ? state.db.expedientes : state.db.documents).find(i => i.id === tr.getAttribute('data-id'));
        if (item) { activeInputSelector = null; setState({ selectedItem: { ...item, type } }); }
    }
});

renderApp();
