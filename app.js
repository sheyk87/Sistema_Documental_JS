// ==========================================
// 1. DATOS INICIALES Y ESTADO
// ==========================================

const INITIAL_AREAS = [
    { id: 'a1', name: 'Dirección General' },
    { id: 'a2', name: 'Recursos Humanos' },
    { id: 'a3', name: 'Sistemas' }
];

const INITIAL_USERS = [
    { id: 'u1', name: 'Admin Sistema', email: 'admin@gde.com', password: '123', areaId: 'a3', role: 'admin' },
    { id: 'u2', name: 'Juan Perez', email: 'juan@gde.com', password: '123', areaId: 'a1', role: 'user' },
    { id: 'u3', name: 'Maria Gomez', email: 'maria@gde.com', password: '123', areaId: 'a2', role: 'user' },
    { id: 'u4', name: 'Carlos Lopez', email: 'carlos@gde.com', password: '123', areaId: 'a3', role: 'user' }
];

const DOC_TYPES = {
    CON_DEST: ['Memo', 'Nota'],
    SIN_DEST: ['Acta', 'Informe', 'Resolucion', 'Disposicion', 'Actuacion']
};

const STATUS = {
    BORRADOR: 'Borrador', FIRMANDOSE: 'Firmandose', FIRMADO: 'Firmado',
    RECHAZADO: 'Rechazado', ANULADO: 'Anulado', DERIVADO: 'Derivado',
    ARCHIVADO: 'Archivado', ELIMINADO: 'Eliminado'
};

let state = {
    db: { areas: INITIAL_AREAS, users: INITIAL_USERS, documents: [], expedientes: [], counters: {} },
    currentUser: null,
    currentView: 'inbox',
    selectedItem: null,
    searchTerms: { inbox: '', drafts: '', search: '', archive: '', anulados: '', expDetail: '', globalFilter: 'todos' },
    sort: {
        inbox: { field: 'date', order: 'desc' }, inboxArea: { field: 'date', order: 'desc' },
        drafts: { field: 'date', order: 'desc' }, search: { field: 'date', order: 'desc' }, 
        archive: { field: 'date', order: 'desc' }, anulados: { field: 'date', order: 'desc' }
    },
    modal: null 
};

const appRoot = document.getElementById('app-root');

// ==========================================
// 2. FUNCIONES AUXILIARES GLOBALES
// ==========================================

const createHistoryEntry = (userId, action, notes = '') => ({ date: new Date().toISOString(), userId, action, notes });
const getUserName = (id) => state.db.users.find(u => u.id === id)?.name || 'Desconocido';
const getAreaName = (id) => state.db.areas.find(a => a.id === id)?.name || 'Desconocida';
const getCurrentYear = () => new Date().getFullYear().toString();

const generateNumber = (type, areaName) => {
    const year = getCurrentYear();
    const key = `${year}-${type.toUpperCase()}`;
    const currentCount = (state.db.counters[key] || 0) + 1;
    state.db.counters[key] = currentCount;
    return `${year}-${type.toUpperCase()}-${String(currentCount).padStart(6, '0')}-${areaName}`;
};

function setState(newState) {
    state = { ...state, ...newState };
    renderApp();
}

function getBadgeColor(status) {
    const colors = {
        [STATUS.BORRADOR]: 'bg-gray-100 text-gray-600 border-gray-200',
        [STATUS.FIRMANDOSE]: 'bg-amber-100 text-amber-700 border-amber-200',
        [STATUS.FIRMADO]: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        [STATUS.RECHAZADO]: 'bg-red-100 text-red-700 border-red-200',
        [STATUS.ANULADO]: 'bg-slate-800 text-slate-200 border-slate-700',
        [STATUS.ELIMINADO]: 'bg-red-900 text-red-100 border-red-900',
        [STATUS.DERIVADO]: 'bg-indigo-100 text-indigo-700 border-indigo-200',
        [STATUS.ARCHIVADO]: 'bg-stone-100 text-stone-600 border-stone-200',
    };
    return colors[status] || colors[STATUS.BORRADOR];
}

function getTypeColorClass(type) {
    const colors = {
        'Memo': 'bg-amber-100 text-amber-800',
        'Nota': 'bg-green-100 text-green-800',
        'Acta': 'bg-orange-100 text-orange-800',
        'Informe': 'bg-blue-100 text-blue-800',
        'Resolucion': 'bg-red-100 text-red-800',
        'Disposicion': 'bg-teal-100 text-teal-800',
        'Actuacion': 'bg-indigo-100 text-indigo-800',
        'expediente': 'bg-purple-100 text-purple-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
}

function getSender(item) {
    if (!item.history || item.history.length === 0) return 'Sistema';
    const transferActions = ['Derivar', 'Enviado a Revisar', 'Rechazado', 'Enviado a firmar'];
    const lastTransfer = [...item.history].reverse().find(h => transferActions.includes(h.action));
    return lastTransfer ? getUserName(lastTransfer.userId) : getUserName(item.creatorId);
}

function canViewExpediente(exp, user) {
    if (exp.isPublic) return true;
    if (exp.creatorId === user.id || exp.currentOwnerId === user.id || exp.currentOwnerId === user.areaId) return true;
    if (exp.authUsers && exp.authUsers.includes(user.id)) return true;
    if (exp.authAreas && exp.authAreas.includes(user.areaId)) return true;
    return false;
}

function isPersonalDoc(d, user) {
    if ([STATUS.ELIMINADO, STATUS.ARCHIVADO, STATUS.ANULADO].includes(d.status)) return false;
    if (d.status === STATUS.BORRADOR || d.status === STATUS.FIRMANDOSE || d.status === STATUS.RECHAZADO) return d.currentOwnerId === user.id;
    return d.owners && d.owners.includes(user.id);
}

function isAreaDoc(d, user) {
    if ([STATUS.ELIMINADO, STATUS.ARCHIVADO, STATUS.ANULADO, STATUS.BORRADOR, STATUS.FIRMANDOSE, STATUS.RECHAZADO].includes(d.status)) return false;
    return d.owners && d.owners.includes(user.areaId);
}

function isPersonalExp(e, user) {
    if ([STATUS.ELIMINADO, STATUS.ARCHIVADO, STATUS.ANULADO].includes(e.status)) return false;
    return e.currentOwnerId === user.id;
}

function isAreaExp(e, user) {
    if ([STATUS.ELIMINADO, STATUS.ARCHIVADO, STATUS.ANULADO].includes(e.status)) return false;
    return e.currentOwnerId === user.areaId;
}

// ==========================================
// 3. SISTEMA DE TABLAS, ORDENAMIENTO Y FILTROS
// ==========================================

function filterItem(item, term) {
    if (!term) return true;
    const t = term.toLowerCase();
    const sender = getSender(item).toLowerCase();
    const date = new Date(item.createdAt).toLocaleDateString();
    return ((item.number || '').toLowerCase().includes(t) || 
            (item.docType || item.type).toLowerCase().includes(t) || 
            item.subject.toLowerCase().includes(t) || 
            item.status.toLowerCase().includes(t) || 
            sender.includes(t) || 
            date.includes(t));
}

function sortItems(items, model) {
    const sortInfo = state.sort[model];
    return items.sort((a, b) => {
        let valA, valB;
        switch(sortInfo.field) {
            case 'number': valA = a.number || ''; valB = b.number || ''; break;
            case 'type': valA = a.docType || a.type; valB = b.docType || b.type; break;
            case 'subject': valA = a.subject.toLowerCase(); valB = b.subject.toLowerCase(); break;
            case 'status': valA = a.status; valB = b.status; break;
            case 'sender': valA = getSender(a).toLowerCase(); valB = getSender(b).toLowerCase(); break;
            case 'acceso': valA = a.isPublic ? 'Publico' : 'Reservado'; valB = b.isPublic ? 'Publico' : 'Reservado'; break;
            case 'fojas': valA = a.linkedDocs?.length || 0; valB = b.linkedDocs?.length || 0; break;
            case 'date': default: valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); break;
        }
        if(valA < valB) return sortInfo.order === 'asc' ? -1 : 1;
        if(valA > valB) return sortInfo.order === 'asc' ? 1 : -1;
        return 0;
    });
}

function renderTable(items, model, emptyMsg, isExpList = false, showAcquireBtn = false) {
    const sortedItems = sortItems(items, model);
    const s = state.sort[model];
    
    const th = (label, field) => {
        const isAct = s.field === field;
        const icon = isAct ? (s.order === 'asc' ? 'chevron-up' : 'chevron-down') : 'minus';
        return `<th class="p-4 font-medium border-b border-gray-200 cursor-pointer hover:bg-gray-100 whitespace-nowrap" data-sort="${model}" data-field="${field}">${label} <i data-lucide="${icon}" class="inline w-3 h-3 text-gray-400"></i></th>`;
    };

    if (sortedItems.length === 0) return `<table class="w-full text-left border-collapse"><tbody><tr><td class="p-8 text-center text-gray-500 text-sm">${emptyMsg}</td></tr></tbody></table>`;

    return `
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                        ${th('ID/Número', 'number')}
                        ${th('Tipo', 'type')}
                        ${th('Asunto', 'subject')}
                        ${th('Estado', 'status')}
                        ${th('Enviado Por', 'sender')}
                        ${isExpList ? th('Acceso', 'acceso') : ''}
                        ${th('Fecha', 'date')}
                        ${isExpList ? th('Fojas', 'fojas') : ''}
                        ${showAcquireBtn ? `<th class="p-4 font-medium border-b border-gray-200">Acción</th>` : ''}
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 text-sm">
                    ${sortedItems.map(item => `
                        <tr class="hover:bg-blue-50/50 transition-colors group cursor-pointer" data-id="${item.id}" data-type="${item.type}">
                            <td class="p-4 font-mono text-xs text-gray-600">${item.number || 'S/N (Borrador)'}</td>
                            <td class="p-4"><span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${getTypeColorClass(item.docType || item.type)}"><i data-lucide="${item.type === 'expediente' ? 'folder-open' : 'file-text'}" class="w-3 h-3"></i> ${item.docType || 'Expediente'}</span></td>
                            <td class="p-4 font-medium text-gray-800">${item.subject}</td>
                            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-medium border ${getBadgeColor(item.status)}">${item.status}</span></td>
                            <td class="p-4 text-gray-700">${getSender(item)}</td>
                            ${isExpList ? `<td class="p-4 text-gray-600 text-xs font-semibold uppercase tracking-wider">${item.isPublic ? 'Público' : 'Reservado'}</td>` : ''}
                            <td class="p-4 text-gray-500">${new Date(item.createdAt).toLocaleDateString()}</td>
                            ${isExpList ? `<td class="p-4 text-gray-600 font-medium">${item.linkedDocs?.length || 0}</td>` : ''}
                            ${showAcquireBtn ? `<td class="p-4"><button data-action="acquire-item" data-id="${item.id}" data-type="${item.type}" class="px-3 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200 transition-colors">Adquirir</button></td>` : ''}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ==========================================
// 4. RENDERIZADO PRINCIPAL Y VISTAS
// ==========================================

function renderApp() {
    if (!state.currentUser) appRoot.innerHTML = renderLogin();
    else appRoot.innerHTML = renderMainLayout();
    restoreInputFocus(); 
    lucide.createIcons();
}

function renderMainLayout() {
    return `
        <div class="flex h-screen bg-gray-50 font-sans text-gray-800">
            <div class="w-64 bg-slate-900 text-white flex flex-col shadow-xl z-10 shrink-0">
                <div class="p-4 bg-slate-950 border-b border-slate-800">
                    <h1 class="text-xl font-bold text-blue-400 flex items-center gap-2"><i data-lucide="building"></i> GDE Web</h1>
                    <p class="text-xs text-slate-400 mt-1">${getUserName(state.currentUser.id)}</p>
                    <p class="text-xs text-slate-500">${getAreaName(state.currentUser.areaId)}</p>
                </div>
                <nav class="flex-1 p-4 space-y-1 overflow-y-auto">
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-4">Mi Trabajo</p>
                    ${renderNavItem('send', 'Bandeja de Entrada', 'inbox')}
                    ${renderNavItem('file-text', 'Mis Borradores', 'drafts')}
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-6">Nuevo</p>
                    ${renderNavItem('file-plus', 'Crear Documento', 'create_doc')}
                    ${renderNavItem('folder-open', 'Crear Expediente', 'create_exp')}
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-6">Consultas</p>
                    ${renderNavItem('search', 'Buscador', 'search')}
                    ${renderNavItem('archive', 'Archivo Central', 'archive')}
                    ${renderNavItem('ban', 'Anulados', 'anulados')}
                    ${state.currentUser.role === 'admin' ? `
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-6">Administración</p>
                        ${renderNavItem('users', 'Usuarios', 'admin_users')}
                        ${renderNavItem('building', 'Áreas', 'admin_areas')}
                    ` : ''}
                </nav>
                <div class="p-4 border-t border-slate-800">
                    <button data-action="logout" class="flex items-center gap-2 text-slate-400 hover:text-white w-full transition-colors"><i data-lucide="log-out"></i> Cerrar Sesión</button>
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
    const isActive = state.currentView === view && !state.selectedItem;
    const activeClass = isActive ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white';
    return `<button data-target-view="${view}" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeClass}"><i data-lucide="${icon}" class="w-4 h-4"></i> ${label}</button>`;
}

function getViewContent() {
    if (state.selectedItem) return state.selectedItem.type === 'expediente' ? renderExpedienteDetail() : renderDocumentDetail();
    switch (state.currentView) {
        case 'inbox': return renderInbox();
        case 'drafts': return renderDrafts();
        case 'create_doc': return renderCreateDocument();
        case 'create_exp': return renderCreateExpediente();
        case 'search': return renderSearcher();
        case 'archive': return renderArchive();
        case 'anulados': return renderAnulados();
        case 'admin_users': return renderAdminUsers();
        case 'admin_areas': return renderAdminAreas();
        default: return renderInbox();
    }
}

function renderInbox() {
    const term = state.searchTerms.inbox;
    
    // Bandeja Personal
    const myDocs = state.db.documents.filter(d => isPersonalDoc(d, state.currentUser)).filter(d => filterItem(d, term));
    const myExps = state.db.expedientes.filter(e => isPersonalExp(e, state.currentUser)).filter(e => filterItem(e, term));

    // Bandeja de Área
    const areaDocs = state.db.documents.filter(d => isAreaDoc(d, state.currentUser) && !isPersonalDoc(d, state.currentUser)).filter(d => filterItem(d, term));
    const areaExps = state.db.expedientes.filter(e => isAreaExp(e, state.currentUser) && !isPersonalExp(e, state.currentUser)).filter(e => filterItem(e, term));

    return `
        <div class="space-y-6">
            <div class="flex bg-white p-3 rounded-xl shadow-sm border border-gray-200">
                <i data-lucide="search" class="text-gray-400 mr-2"></i><input type="text" data-search-model="inbox" placeholder="Filtrar bandejas (por número, asunto, remitente, etc)..." value="${term}" class="w-full outline-none text-sm" autofocus />
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-gray-200 bg-blue-50"><h3 class="font-semibold text-blue-900 flex items-center gap-2"><i data-lucide="user" class="w-4 h-4"></i> Mi Bandeja Personal (${myDocs.length + myExps.length})</h3></div>
                ${myDocs.length > 0 ? renderTable(myDocs, 'inbox', '') : ''}
                ${myExps.length > 0 ? renderTable(myExps, 'inbox', '', true) : ''}
                ${myDocs.length === 0 && myExps.length === 0 ? '<div class="p-8 text-center text-gray-500 text-sm">No tienes trámites pendientes en tu bandeja personal.</div>' : ''}
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-gray-200 bg-slate-100"><h3 class="font-semibold text-slate-800 flex items-center gap-2"><i data-lucide="users" class="w-4 h-4"></i> Bandeja de mi Área (${areaDocs.length + areaExps.length})</h3></div>
                ${areaDocs.length > 0 ? renderTable(areaDocs, 'inboxArea', '', false, true) : ''}
                ${areaExps.length > 0 ? renderTable(areaExps, 'inboxArea', '', true, true) : ''}
                ${areaDocs.length === 0 && areaExps.length === 0 ? '<div class="p-8 text-center text-gray-500 text-sm">No hay trámites pendientes para adquirir en el área.</div>' : ''}
            </div>
        </div>
    `;
}

function renderDrafts() {
    const term = state.searchTerms.drafts;
    const drafts = state.db.documents.filter(d => d.creatorId === state.currentUser.id && (d.status === STATUS.BORRADOR || d.status === STATUS.RECHAZADO) && d.currentOwnerId === state.currentUser.id).filter(d => filterItem(d, term));
    return `
        <div class="space-y-6">
            <div class="flex bg-white p-3 rounded-xl shadow-sm border border-gray-200">
                <i data-lucide="search" class="text-gray-400 mr-2"></i><input type="text" data-search-model="drafts" placeholder="Filtrar borradores..." value="${term}" class="w-full outline-none text-sm" autofocus />
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 class="font-semibold text-gray-800">Mis Borradores (${drafts.length})</h3></div>
                ${renderTable(drafts, 'drafts', 'No tienes borradores.')}
            </div>
        </div>
    `;
}

function renderArchive() {
    const term = state.searchTerms.archive;
    const docs = state.db.documents.filter(d => d.status === STATUS.ARCHIVADO && (d.creatorId === state.currentUser.id || d.owners?.includes(state.currentUser.id) || d.owners?.includes(state.currentUser.areaId) || state.db.users.find(u=>u.id===d.creatorId)?.areaId === state.currentUser.areaId)).filter(d => filterItem(d, term));
    const exps = state.db.expedientes.filter(e => e.status === STATUS.ARCHIVADO && canViewExpediente(e, state.currentUser)).filter(e => filterItem(e, term));
    return `
        <div class="space-y-6">
            <div class="flex bg-white p-3 rounded-xl shadow-sm border border-gray-200">
                <i data-lucide="search" class="text-gray-400 mr-2"></i><input type="text" data-search-model="archive" placeholder="Filtrar archivo..." value="${term}" class="w-full outline-none text-sm" autofocus />
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-gray-200 bg-stone-100"><h3 class="font-semibold text-stone-800">Documentos Archivados (${docs.length})</h3></div>
                ${renderTable(docs, 'archive', 'No hay documentos archivados.')}
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-gray-200 bg-stone-100"><h3 class="font-semibold text-stone-800">Expedientes Archivados (${exps.length})</h3></div>
                ${renderTable(exps, 'archive', 'No hay expedientes archivados.', true)}
            </div>
        </div>
    `;
}

function renderAnulados() {
    const term = state.searchTerms.anulados;
    const docs = state.db.documents.filter(d => d.status === STATUS.ANULADO).filter(d => filterItem(d, term));
    const exps = state.db.expedientes.filter(e => e.status === STATUS.ANULADO && canViewExpediente(e, state.currentUser)).filter(e => filterItem(e, term));
    return `
        <div class="space-y-6">
            <div class="flex bg-white p-3 rounded-xl shadow-sm border border-gray-200">
                <i data-lucide="search" class="text-gray-400 mr-2"></i><input type="text" data-search-model="anulados" placeholder="Filtrar anulados..." value="${term}" class="w-full outline-none text-sm" autofocus />
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-red-200 bg-red-50"><h3 class="font-semibold text-red-800">Documentos Anulados (${docs.length})</h3></div>
                ${renderTable(docs, 'anulados', 'No hay documentos anulados.')}
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-red-200 bg-red-50"><h3 class="font-semibold text-red-800">Expedientes Anulados (${exps.length})</h3></div>
                ${renderTable(exps, 'anulados', 'No hay expedientes anulados.', true)}
            </div>
        </div>
    `;
}

function renderSearcher() {
    const term = state.searchTerms.search;
    const filter = state.searchTerms.globalFilter;

    const searchableDocs = state.db.documents.filter(d => {
        if ([STATUS.BORRADOR, STATUS.FIRMANDOSE, STATUS.ELIMINADO].includes(d.status)) return false;
        const creatorArea = state.db.users.find(u => u.id === d.creatorId)?.areaId;
        return creatorArea === state.currentUser.areaId || d.owners?.includes(state.currentUser.id) || d.owners?.includes(state.currentUser.areaId);
    });

    const searchableExps = state.db.expedientes.filter(e => {
        if (e.status === STATUS.ELIMINADO) return false;
        return canViewExpediente(e, state.currentUser);
    });

    const results = [...searchableDocs, ...searchableExps].filter(item => {
        if (!filterItem(item, term)) return false;
        if (filter === 'doc' && item.type !== 'documento') return false;
        if (filter === 'exp' && item.type !== 'expediente') return false;
        return true;
    });

    return `
        <div class="max-w-5xl mx-auto space-y-6">
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><i data-lucide="search" class="w-5 h-5"></i> Consulta General</h2>
                <div class="flex gap-4">
                    <input type="text" data-search-model="search" placeholder="Buscar general..." value="${term}" class="flex-1 px-4 py-2 border rounded-lg outline-none focus:border-blue-500" autofocus />
                    <select data-search-model="globalFilter" class="px-4 py-2 border rounded-lg bg-white outline-none">
                        <option value="todos" ${filter === 'todos' ? 'selected' : ''}>Todos</option>
                        <option value="doc" ${filter === 'doc' ? 'selected' : ''}>Solo Documentos</option>
                        <option value="exp" ${filter === 'exp' ? 'selected' : ''}>Solo Expedientes</option>
                    </select>
                </div>
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                ${renderTable(results, 'search', 'No se encontraron resultados.', filter === 'exp' || filter === 'todos')}
            </div>
        </div>
    `;
}

function renderAdminUsers() {
    return `
        <div class="max-w-5xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 class="font-bold text-lg mb-4">ABM de Usuarios</h3>
            <form id="form-admin-user" class="flex gap-4 mb-6 p-4 bg-slate-50 rounded-lg border">
                <input required type="text" id="admin-u-name" placeholder="Nombre Completo" class="flex-1 px-3 py-2 border rounded outline-none" />
                <input required type="email" id="admin-u-email" placeholder="Correo Electrónico" class="flex-1 px-3 py-2 border rounded outline-none" />
                <select id="admin-u-area" class="px-3 py-2 border rounded outline-none">
                    ${state.db.areas.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
                </select>
                <select id="admin-u-role" class="px-3 py-2 border rounded outline-none">
                    <option value="user">Usuario normal</option>
                    <option value="admin">Administrador</option>
                </select>
                <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Crear</button>
            </form>
            <table class="w-full text-left text-sm border-collapse">
                <thead class="bg-gray-50"><tr class="border-b"><th class="p-2">ID</th><th class="p-2">Nombre</th><th class="p-2">Email</th><th class="p-2">Área</th><th class="p-2">Rol</th><th class="p-2">Acciones</th></tr></thead>
                <tbody class="divide-y">
                    ${state.db.users.map(u => `<tr><td class="p-2 text-xs text-gray-500">${u.id}</td><td class="p-2 font-medium">${u.name}</td><td class="p-2">${u.email}</td><td class="p-2">${getAreaName(u.areaId)}</td><td class="p-2 uppercase text-xs">${u.role}</td><td class="p-2"><button data-action="admin-del-user" data-id="${u.id}" class="text-red-500 hover:text-red-700 text-xs font-bold">Eliminar</button></td></tr>`).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderAdminAreas() {
    return `
        <div class="max-w-3xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 class="font-bold text-lg mb-4">ABM de Áreas</h3>
            <form id="form-admin-area" class="flex gap-4 mb-6 p-4 bg-slate-50 rounded-lg border">
                <input required type="text" id="admin-a-name" placeholder="Nombre del Área" class="flex-1 px-3 py-2 border rounded outline-none" />
                <button type="submit" class="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-900">Agregar</button>
            </form>
            <table class="w-full text-left text-sm border-collapse">
                <thead class="bg-gray-50"><tr class="border-b"><th class="p-2">ID</th><th class="p-2">Nombre</th><th class="p-2">Acciones</th></tr></thead>
                <tbody class="divide-y">
                    ${state.db.areas.map(a => `<tr><td class="p-2 text-xs text-gray-500">${a.id}</td><td class="p-2 font-medium">${a.name}</td><td class="p-2"><button data-action="admin-del-area" data-id="${a.id}" class="text-red-500 hover:text-red-700 text-xs font-bold">Eliminar</button></td></tr>`).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderLogin() {
    return `
        <div class="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div class="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-6">
                <div class="text-center">
                    <div class="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4"><i data-lucide="building" class="text-blue-600 w-8 h-8"></i></div>
                    <h2 class="text-2xl font-bold text-gray-900">Sistema GDE</h2>
                </div>
                <div id="login-error" class="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center border border-red-200 hide"></div>
                <form id="form-login" class="space-y-4">
                    <input type="email" id="login-email" value="admin@gde.com" class="w-full px-4 py-2 border rounded-lg outline-none" />
                    <input type="password" id="login-password" value="123" class="w-full px-4 py-2 border rounded-lg outline-none" />
                    <button type="submit" class="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 shadow-md">Ingresar al Sistema</button>
                </form>
            </div>
        </div>
    `;
}

function renderCreateDocument() {
    return `
        <div class="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 class="font-semibold text-gray-800 text-lg">Nuevo Documento</h3></div>
            <form id="form-create-doc" class="p-6 space-y-6">
                <div class="grid grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de Documento</label>
                        <select id="create-doc-type" class="w-full px-3 py-2 border rounded-lg outline-none">
                            <optgroup label="Con Destinatario">${DOC_TYPES.CON_DEST.map(t => `<option value="${t}">${t}</option>`).join('')}</optgroup>
                            <optgroup label="Sin Destinatario">${DOC_TYPES.SIN_DEST.map(t => `<option value="${t}">${t}</option>`).join('')}</optgroup>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Asunto Inicial</label>
                        <input required type="text" id="create-doc-subject" class="w-full px-3 py-2 border rounded-lg outline-none" />
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Cuerpo del Documento</label>
                    <textarea required id="create-doc-content" rows="6" class="w-full px-3 py-2 border rounded-lg outline-none font-serif text-gray-700"></textarea>
                </div>
                <div class="flex justify-end gap-3 pt-4 border-t">
                    <button type="submit" class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2">Continuar Borrador <i data-lucide="chevron-right" class="w-4 h-4"></i></button>
                </div>
            </form>
        </div>
    `;
}

function renderCreateExpediente() {
    return `
        <div class="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2"><i data-lucide="folder-open" class="text-purple-600"></i><h3 class="font-semibold text-gray-800 text-lg">Apertura de Expediente</h3></div>
            <form id="form-create-exp" class="p-6 space-y-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Carátula / Asunto</label>
                    <input required type="text" id="create-exp-subject" class="w-full px-3 py-2 border rounded-lg outline-none" />
                </div>
                <div class="p-4 bg-purple-50 rounded-lg border border-purple-100">
                    <label class="flex items-center gap-3 cursor-pointer mb-2">
                        <input type="checkbox" id="create-exp-public" checked class="w-5 h-5 text-purple-600 rounded" onchange="document.getElementById('private-auth-box').classList.toggle('hidden', this.checked)" />
                        <div><p class="font-medium text-purple-900">Expediente Público</p><p class="text-xs text-purple-700">Si se desmarca, deberá elegir quién puede verlo.</p></div>
                    </label>
                    <div id="private-auth-box" class="hidden mt-4 pt-4 border-t border-purple-200">
                        <p class="text-sm font-medium mb-2">Autorizados (además de usted y su área):</p>
                        <div class="max-h-40 overflow-y-auto bg-white border rounded p-2 text-sm space-y-1">
                            ${state.db.areas.map(a => `<label class="flex items-center gap-2"><input type="checkbox" name="auth_areas" value="${a.id}"> Área: ${a.name}</label>`).join('')}
                            ${state.db.users.filter(u=>u.id!==state.currentUser.id).map(u => `<label class="flex items-center gap-2"><input type="checkbox" name="auth_users" value="${u.id}"> Usuario: ${u.name}</label>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="flex justify-end pt-4 border-t"><button type="submit" class="px-6 py-2.5 bg-purple-600 text-white rounded-lg font-medium">Generar Expediente</button></div>
            </form>
        </div>
    `;
}

// --- DETALLE DE DOCUMENTO ---
function renderDocumentDetail() {
    const doc = state.selectedItem;
    
    const isOwner = doc.currentOwnerId === state.currentUser.id;
    const isMyTurnToSign = doc.status === STATUS.FIRMANDOSE && isOwner;
    const isBorradorOrRechazado = (doc.status === STATUS.BORRADOR || doc.status === STATUS.RECHAZADO) && isOwner;
    const canEdit = isBorradorOrRechazado || isMyTurnToSign;
    
    const isConDestinatario = DOC_TYPES.CON_DEST.includes(doc.docType);
    const isSignedOrArchived = doc.status === STATUS.FIRMADO || doc.status === STATUS.ARCHIVADO;

    const vinculados = state.db.expedientes.filter(e => e.linkedDocs && e.linkedDocs.includes(doc.id));
    const relacionados = (doc.relatedDocs || []).map(did => state.db.documents.find(d => d.id === did)).filter(Boolean);

    return `
        <div class="flex gap-6 max-w-7xl mx-auto h-[calc(100vh-8rem)]">
            <div class="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                <div class="px-8 py-4 border-b border-gray-200 bg-white flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <span class="font-medium px-3 py-1 rounded-full text-sm ${getTypeColorClass(doc.docType)}">${doc.docType}</span>
                        <span class="font-mono text-lg text-gray-700">${doc.number || 'Borrador S/N'}</span>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-xs font-medium border ${getBadgeColor(doc.status)}">${doc.status}</span>
                </div>

                <div class="flex-1 overflow-auto p-8 bg-gray-50/50">
                    <div class="max-w-4xl mx-auto bg-white min-h-[700px] shadow-lg border border-gray-300 p-12 flex flex-col relative">
                        ${doc.status === STATUS.ANULADO ? `<div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 z-0"><span class="text-8xl text-red-600 font-black transform -rotate-45 border-8 border-red-600 p-8">ANULADO</span></div>` : ''}
                        
                        <div class="text-sm space-y-2 mb-8 border-b-2 border-gray-800 pb-6 relative z-10">
                            <div class="flex justify-between">
                                <p><strong>TIPO:</strong> ${doc.docType.toUpperCase()}</p>
                                <p><strong>FECHA:</strong> ${new Date(doc.createdAt).toLocaleDateString()}</p>
                            </div>
                            
                            ${isConDestinatario ? `<p><strong>DESTINATARIOS:</strong> ${doc.recipients.map(id => getUserName(id)).join(', ') || 'Ninguno'}</p>` : ''}
                            
                            <div class="mt-4">
                                <label class="font-bold block mb-1">ASUNTO:</label>
                                ${canEdit ? `<input type="text" id="edit-doc-subject" value="${doc.subject}" class="w-full p-2 border font-medium outline-none" />` : `<p class="text-lg">${doc.subject}</p>`}
                            </div>
                        </div>

                        <div class="flex-1 relative z-10 mb-12">
                            ${canEdit ? `<textarea id="edit-doc-content" class="w-full h-full min-h-[300px] p-2 border outline-none font-serif resize-y leading-relaxed text-gray-800">${doc.content}</textarea>` : `<div class="font-serif text-lg leading-relaxed text-gray-800 whitespace-pre-wrap">${doc.content}</div>`}
                        </div>
                        
                        ${doc.signedBy && doc.signedBy.length > 0 ? `
                            <div class="mt-8 pt-8 border-t border-gray-300 relative z-10 mb-12 flex justify-center gap-8 flex-wrap">
                                ${doc.signedBy.map(s => `
                                    <div class="text-center text-emerald-700">
                                        <p class="font-serif italic text-2xl mb-1 border-b border-emerald-200 inline-block px-4">Firmado Digitalmente</p>
                                        <p class="font-bold text-sm text-gray-800">${getUserName(s.id)}</p>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}

                        <div class="mt-auto pt-8 border-t border-gray-200 bg-gray-50 -mx-12 -mb-12 p-8 text-sm">
                            <h4 class="font-bold text-gray-600 mb-4">REFERENCIAS DEL DOCUMENTO</h4>
                            ${vinculados.length > 0 ? `
                                <div class="mb-4"><strong>Vinculado en Expedientes:</strong>
                                    <ul class="list-disc pl-5 mt-1 text-purple-700">${vinculados.map(e => `<li class="cursor-pointer hover:underline" data-action="view-item" data-id="${e.id}" data-type="expediente">${e.number} - ${e.subject}</li>`).join('')}</ul>
                                </div>
                            ` : ''}
                            
                            <div class="mb-4">
                                <div class="flex justify-between items-center">
                                    <strong>Documentos Relacionados:</strong>
                                    ${canEdit ? `<button data-action="open-modal" data-modal-type="relacionar_doc" class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">+ Relacionar Doc</button>` : ''}
                                </div>
                                ${relacionados.length > 0 ? `
                                    <ul class="list-disc pl-5 mt-1 text-blue-700">${relacionados.map(d => `<li class="flex items-center"><span class="cursor-pointer hover:underline flex-1" data-action="view-item" data-id="${d.id}" data-type="documento">${d.number} - ${d.subject}</span> ${canEdit ? `<button data-action="doc-unrelate" data-id="${d.id}" class="text-red-500 hover:text-red-700 font-bold ml-2">X</button>` : ''}</li>`).join('')}</ul>
                                ` : '<p class="text-xs text-gray-500 mt-1">Sin relaciones.</p>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="w-80 flex flex-col gap-4">
                <button data-action="close-detail" class="w-full py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Volver</button>

                ${(isOwner || isSignedOrArchived) && doc.status !== STATUS.ANULADO ? `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <h3 class="font-semibold text-gray-800 mb-4 flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i> Acciones</h3>
                    <div class="space-y-2">
                        ${isBorradorOrRechazado ? `
                            ${isConDestinatario ? `<button data-action="open-modal" data-modal-type="destinatarios" class="w-full py-2 bg-purple-600 text-white rounded text-sm font-medium mb-2">Seleccionar Destinatarios</button>` : ''}
                            <button data-action="doc-sign-direct" class="w-full py-2 bg-emerald-600 text-white rounded text-sm font-medium">Firmar Yo Mismo</button>
                            <button data-action="open-modal" data-modal-type="enviar_firmar" class="w-full py-2 bg-blue-500 text-white rounded text-sm font-medium">Enviar a Firmar</button>
                            <button data-action="open-modal" data-modal-type="revisar" class="w-full py-2 bg-amber-500 text-white rounded text-sm font-medium">Enviar a Revisar</button>
                            <button data-action="doc-delete" class="w-full py-2 bg-red-100 text-red-700 border border-red-200 rounded text-sm font-medium mt-4">Eliminar Borrador</button>
                        ` : ''}

                        ${isMyTurnToSign ? `
                            ${isConDestinatario ? `<button data-action="open-modal" data-modal-type="destinatarios" class="w-full py-2 bg-purple-600 text-white rounded text-sm font-medium mb-2">Actualizar Destinatarios</button>` : ''}
                            <button data-action="doc-sign-pending" class="w-full py-2 bg-emerald-600 text-white rounded text-sm font-medium mb-2">Aplicar mi Firma</button>
                            <button data-action="open-modal" data-modal-type="rechazar_doc" class="w-full py-2 bg-red-500 text-white rounded text-sm font-medium">Rechazar / Devolver</button>
                        ` : ''}

                        ${isSignedOrArchived ? `
                            <button data-action="open-modal" data-modal-type="derivar_doc" class="w-full py-2 bg-indigo-600 text-white rounded text-sm font-medium mb-2">Derivar Documento</button>
                            ${doc.status === STATUS.FIRMADO ? `<button data-action="open-modal" data-modal-type="archivar_doc" class="w-full py-2 bg-stone-600 text-white rounded text-sm font-medium mb-2">Archivar Documento</button>` : ''}
                            <button data-action="open-modal" data-modal-type="anular_doc" class="w-full py-2 bg-slate-800 text-white rounded text-sm font-medium">Anular Documento</button>
                        ` : ''}
                    </div>
                </div>
                ` : ''}
                
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex-1 overflow-hidden flex flex-col">
                    <h3 class="font-semibold text-gray-800 mb-4">Historial</h3>
                    <div class="flex-1 overflow-auto pr-2 space-y-4">
                        ${[...doc.history].reverse().map(h => `
                            <div class="pl-4 border-l-2 border-blue-200 pb-2">
                                <p class="text-xs font-semibold">${h.action}</p>
                                <p class="text-[10px] text-gray-500"><strong>${getUserName(h.userId)}</strong> • ${new Date(h.date).toLocaleString()}</p>
                                ${h.notes ? `<p class="text-xs text-gray-600 bg-gray-50 p-1.5 rounded border border-gray-100 mt-1 italic">"${h.notes}"</p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// --- DETALLE DE EXPEDIENTE ---
function renderExpedienteDetail() {
    const exp = state.selectedItem;
    const isArchived = exp.status === STATUS.ARCHIVADO;
    const isAnulado = exp.status === STATUS.ANULADO;
    const isActive = !isArchived && !isAnulado;
    
    const isOwnerUser = exp.currentOwnerId === state.currentUser.id; 
    
    const term = state.searchTerms.expDetail.toLowerCase();
    const linkedDocsList = exp.linkedDocs.map(did => state.db.documents.find(d => d.id === did)).filter(Boolean).filter(d => (d.number||'').toLowerCase().includes(term) || d.subject.toLowerCase().includes(term));

    return `
        <div class="max-w-5xl mx-auto h-[calc(100vh-8rem)] flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div class="px-8 py-6 border-b border-gray-200 bg-purple-50 flex justify-between items-center shrink-0">
                <div class="flex items-center gap-4">
                    <div class="p-3 bg-white rounded-lg shadow-sm text-purple-600"><i data-lucide="folder-open" class="w-8 h-8"></i></div>
                    <div><h2 class="text-2xl font-bold">${exp.number}</h2><p class="text-gray-600 font-medium">${exp.subject}</p></div>
                </div>
                <div class="flex items-center gap-4">
                    ${!exp.isPublic ? '<span class="px-3 py-1 rounded-full text-xs font-bold border bg-yellow-100 text-yellow-800">RESERVADO</span>' : ''}
                    ${isArchived ? '<span class="px-3 py-1 rounded-full text-sm font-medium border bg-stone-100 text-stone-700">SELLADO / ARCHIVADO</span>' : ''}
                    ${isAnulado ? '<span class="px-3 py-1 rounded-full text-sm font-medium border bg-red-100 text-red-700">ANULADO</span>' : ''}
                    <span class="px-3 py-1 rounded-full text-sm font-medium border bg-white">${exp.status}</span>
                    <button data-action="close-detail" class="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Volver</button>
                </div>
            </div>

            <div class="flex-1 flex overflow-hidden">
                <div class="flex-1 flex flex-col p-6 bg-gray-50 border-r border-gray-200 overflow-hidden">
                    <div class="flex justify-between items-center mb-4 shrink-0">
                        <h3 class="font-semibold text-lg">Fojas (${exp.linkedDocs.length})</h3>
                        ${isOwnerUser && isActive ? `<button data-action="open-modal" data-modal-type="vincular_doc" class="px-3 py-1.5 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700">Vincular Documentos</button>` : ''}
                    </div>
                    <input type="text" data-search-model="expDetail" placeholder="Buscar foja vinculada..." value="${state.searchTerms.expDetail}" class="w-full px-3 py-2 border rounded-lg text-sm mb-4 outline-none" />
                    
                    <div class="space-y-3 overflow-y-auto flex-1 pr-2">
                        ${linkedDocsList.length === 0 ? '<div class="text-center p-8 bg-white border border-dashed text-gray-400 text-sm rounded-lg">No hay fojas que coincidan con la búsqueda.</div>' : linkedDocsList.map((d) => {
                            const originalIndex = exp.linkedDocs.findIndex(id=>id===d.id) + 1;
                            const isSealed = exp.sealedDocs?.includes(d.id) || isArchived;
                            return `
                            <div class="bg-white p-4 rounded-lg border shadow-sm flex items-center justify-between group">
                                <div class="flex items-center gap-4"><div class="font-bold text-slate-500">${originalIndex}</div><div><p class="font-medium text-blue-700">${d.number}</p><p class="text-sm text-gray-600">${d.subject}</p></div></div>
                                <div class="flex gap-2">
                                    ${isOwnerUser && isActive && !isSealed ? `<button data-action="exp-unlink" data-id="${d.id}" class="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded border border-red-200 opacity-0 group-hover:opacity-100 transition-opacity">Desvincular</button>` : ''}
                                    ${isSealed ? `<span class="px-3 py-1.5 text-xs text-gray-400 bg-gray-100 rounded border">Sellada</span>` : ''}
                                    <button data-action="view-item" data-id="${d.id}" data-type="documento" class="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs rounded border">Ver</button>
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
                            ${!exp.isPublic ? `<button data-action="open-modal" data-modal-type="editar_permisos_exp" class="w-full py-1.5 bg-yellow-50 text-yellow-700 text-sm rounded border border-yellow-200">Editar Permisos</button>` : ''}
                            <button data-action="open-modal" data-modal-type="derivar_exp" class="w-full py-1.5 bg-indigo-600 text-white text-sm rounded border">Derivar Expediente</button>
                            ${isActive ? `
                                <button data-action="open-modal" data-modal-type="archivar_exp" class="w-full py-1.5 bg-stone-600 text-white text-sm rounded border">Archivar (Sellar Fojas)</button>
                                <button data-action="open-modal" data-modal-type="anular_exp" class="w-full py-1.5 bg-slate-800 text-white text-sm rounded border mt-4">Anular Expediente</button>
                            ` : ''}
                            ${isArchived ? `
                                <button data-action="exp-desarchivar" class="w-full py-1.5 bg-amber-500 text-white text-sm rounded border">Desarchivar Expediente</button>
                            ` : ''}
                        </div>
                    ` : ''}
                    
                    <h4 class="font-semibold mb-4 border-b pb-2">Movimientos</h4>
                    <div class="flex-1 overflow-auto space-y-4">
                        ${[...exp.history].reverse().map(h => `
                            <div class="text-sm border-l-2 border-purple-200 pl-3">
                                <p class="font-medium">${h.action}</p>
                                <p class="text-[10px] text-gray-500"><strong>${getUserName(h.userId)}</strong> • ${new Date(h.date).toLocaleString()}</p>
                                ${h.notes ? `<p class="text-xs text-gray-600 mt-0.5 italic">"${h.notes}"</p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// 5. SISTEMA DE MODALES
// ==========================================

function renderModalOverlay() {
    if (!state.modal) return '';
    const m = state.modal;
    let title = '', content = '';

    const term = (m.search || '').toLowerCase();
    
    const mixedList = [
        ...state.db.areas.map(a => ({ id: a.id, name: `[Área] ${a.name}` })),
        ...state.db.users.filter(u => u.id !== state.currentUser.id).map(u => ({ id: u.id, name: `${u.name} (${getAreaName(u.areaId)})` }))
    ].filter(i => i.name.toLowerCase().includes(term));

    const usersList = state.db.users.filter(u => u.id !== state.currentUser.id && u.name.toLowerCase().includes(term));
    const docsFirmados = state.db.documents.filter(d => (d.status === STATUS.FIRMADO || d.status === STATUS.ARCHIVADO) && d.id !== state.selectedItem?.id && ((d.number||'').toLowerCase().includes(term) || d.subject.toLowerCase().includes(term)));

    if (m.type === 'revisar' || m.type === 'derivar_exp') {
        title = m.type === 'revisar' ? 'Enviar a Revisar' : 'Derivar Expediente';
        const list = m.type === 'derivar_exp' ? mixedList : usersList;
        
        content = `
            <input type="text" data-modal-input="search" placeholder="Buscar destino único..." value="${m.search}" class="w-full p-2 mb-2 border rounded text-sm outline-none" autofocus />
            <div class="border rounded mb-4 max-h-40 overflow-y-auto bg-gray-50 p-1">
                ${list.map(i => `<label class="flex items-center gap-2 p-2 hover:bg-white cursor-pointer text-sm border-b last:border-0"><input type="radio" name="modal_selection" value="${i.id}" ${m.selectedId === i.id ? 'checked' : ''} data-modal-input="selectedId" /> ${i.name}</label>`).join('')}
            </div>
            <textarea data-modal-input="note" placeholder="Nota de transferencia (requerida)..." class="w-full p-2 border rounded text-sm outline-none mb-4" rows="3">${m.note}</textarea>
        `;
    } 
    else if (m.type === 'derivar_doc' || m.type === 'enviar_firmar' || m.type === 'destinatarios') {
        const titles = { derivar_doc: 'Derivar Documento', enviar_firmar: 'Seleccionar Firmantes', destinatarios: 'Seleccionar Destinatarios' };
        title = titles[m.type];
        const list = m.type === 'derivar_doc' ? mixedList : usersList;
        
        content = `
            <input type="text" data-modal-input="search" placeholder="Buscar..." value="${m.search}" class="w-full p-2 mb-2 border rounded text-sm outline-none" autofocus />
            <div class="border rounded mb-4 max-h-40 overflow-y-auto bg-gray-50 p-1">
                ${list.map(u => `<label class="flex items-center gap-2 p-2 hover:bg-white cursor-pointer text-sm border-b last:border-0"><input type="checkbox" value="${u.id}" ${m.selectionArr.includes(u.id) ? 'checked' : ''} data-modal-toggle="selectionArr" /> ${u.name}</label>`).join('')}
            </div>
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
        const isVincular = m.type === 'vincular_doc';
        const filteredDocs = isVincular ? docsFirmados.filter(d => !state.selectedItem?.linkedDocs?.includes(d.id)) : docsFirmados.filter(d => !state.selectedItem?.relatedDocs?.includes(d.id));
        
        content = `
            <input type="text" data-modal-input="search" placeholder="Buscar documento firmado..." value="${m.search}" class="w-full p-2 mb-2 border rounded text-sm outline-none" autofocus />
            <div class="border rounded mb-4 max-h-60 overflow-y-auto bg-gray-50 p-1">
                ${filteredDocs.length === 0 ? '<p class="text-xs text-gray-500 p-2 text-center">No hay documentos disponibles</p>' : filteredDocs.map(d => `
                    <label class="flex items-center gap-2 p-2 hover:bg-white cursor-pointer text-sm border-b last:border-0">
                        <input type="checkbox" value="${d.id}" ${m.selectionArr.includes(d.id) ? 'checked' : ''} data-modal-toggle="selectionArr" /> 
                        <div><p class="font-medium text-blue-700">${d.number}</p><p class="text-xs text-gray-500">${d.subject}</p></div>
                    </label>
                `).join('')}
            </div>
        `;
    }
    else if (['archivar_doc', 'anular_doc', 'archivar_exp', 'anular_exp', 'rechazar_doc'].includes(m.type)) {
        const titles = { archivar_doc: 'Archivar Documento', anular_doc: 'Anular Documento', archivar_exp: 'Archivar Expediente', anular_exp: 'Anular Expediente', rechazar_doc: 'Rechazar Documento' };
        title = titles[m.type];
        content = `
            <p class="text-sm text-gray-600 mb-2">Ingrese un motivo obligatorio:</p>
            <textarea data-modal-input="note" placeholder="Motivo de la acción..." class="w-full p-2 border rounded text-sm outline-none mb-4" rows="3">${m.note}</textarea>
        `;
    }

    return `
        <div class="absolute inset-0 bg-slate-900/40 z-50 flex items-center justify-center backdrop-blur-sm">
            <div class="bg-white rounded-xl p-6 w-[500px] shadow-2xl flex flex-col max-h-[90vh]">
                <h3 class="font-bold text-lg mb-4 text-gray-800">${title}</h3>
                ${content}
                <div class="flex justify-end gap-2 mt-auto">
                    <button data-action="close-modal" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                    <button data-action="confirm-modal" class="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Confirmar</button>
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// 6. EVENTOS GLOBALES (DELEGACIÓN)
// ==========================================

let activeInputSelector = null;
function restoreInputFocus() {
    if (activeInputSelector) {
        const input = document.querySelector(activeInputSelector);
        if (input) {
            input.focus();
            const val = input.value; input.value = ''; input.value = val;
        }
    }
}

document.addEventListener('input', (e) => {
    if (e.target.hasAttribute('data-search-model')) {
        const model = e.target.getAttribute('data-search-model');
        state.searchTerms[model] = e.target.value;
        activeInputSelector = `[data-search-model="${model}"]`;
        renderApp();
    }
    if (e.target.hasAttribute('data-modal-input')) {
        const key = e.target.getAttribute('data-modal-input');
        state.modal[key] = e.target.value;
        if (key === 'search') {
            activeInputSelector = `[data-modal-input="search"]`;
            renderApp();
        }
    }
});

document.addEventListener('change', (e) => {
    if (e.target.hasAttribute('data-modal-toggle')) {
        const key = e.target.getAttribute('data-modal-toggle');
        const val = e.target.value;
        if (e.target.checked) state.modal[key].push(val);
        else state.modal[key] = state.modal[key].filter(v => v !== val);
    }
});

document.addEventListener('submit', (e) => {
    if (e.target.id === 'form-login') {
        e.preventDefault();
        const user = state.db.users.find(u => u.email === document.getElementById('login-email').value && u.password === document.getElementById('login-password').value);
        if (user) setState({ currentUser: user, currentView: 'inbox', selectedItem: null });
        else document.getElementById('login-error').classList.remove('hide');
    }
    else if (e.target.id === 'form-create-doc') {
        e.preventDefault();
        state.db.documents.push({
            id: `doc_${Date.now()}`, type: 'documento', docType: document.getElementById('create-doc-type').value,
            subject: document.getElementById('create-doc-subject').value, content: document.getElementById('create-doc-content').value,
            creatorId: state.currentUser.id, currentOwnerId: state.currentUser.id, owners: [state.currentUser.id],
            status: STATUS.BORRADOR, number: null, createdAt: new Date().toISOString(),
            signatories: [], recipients: [], relatedDocs: [], signedBy: [], history: [createHistoryEntry(state.currentUser.id, 'Creación', 'Se generó borrador')]
        });
        setState({ currentView: 'drafts' });
    }
    else if (e.target.id === 'form-create-exp') {
        e.preventDefault();
        const isPublic = document.getElementById('create-exp-public').checked;
        const authAreas = isPublic ? [] : Array.from(document.querySelectorAll('input[name="auth_areas"]:checked')).map(el => el.value);
        const authUsers = isPublic ? [] : Array.from(document.querySelectorAll('input[name="auth_users"]:checked')).map(el => el.value);
        
        state.db.expedientes.push({
            id: `exp_${Date.now()}`, type: 'expediente', number: generateNumber('EX', getAreaName(state.currentUser.areaId)),
            subject: document.getElementById('create-exp-subject').value, creatorId: state.currentUser.id, currentOwnerId: state.currentUser.id,
            status: 'En Tramite', isPublic, authAreas, authUsers, linkedDocs: [], sealedDocs: [], createdAt: new Date().toISOString(),
            history: [createHistoryEntry(state.currentUser.id, 'Apertura', 'Expediente inicializado')]
        });
        setState({ currentView: 'inbox' });
    }
    else if (e.target.id === 'form-admin-area') {
        e.preventDefault();
        state.db.areas.push({ id: `a${Date.now()}`, name: document.getElementById('admin-a-name').value });
        setState({});
    }
    else if (e.target.id === 'form-admin-user') {
        e.preventDefault();
        state.db.users.push({
            id: `u${Date.now()}`, name: document.getElementById('admin-u-name').value,
            email: document.getElementById('admin-u-email').value, areaId: document.getElementById('admin-u-area').value, 
            role: document.getElementById('admin-u-role').value, password: '123'
        });
        setState({});
    }
});

document.addEventListener('click', (e) => {
    const thSort = e.target.closest('th[data-sort]');
    if (thSort) {
        const model = thSort.getAttribute('data-sort');
        const field = thSort.getAttribute('data-field');
        if (state.sort[model].field === field) {
            state.sort[model].order = state.sort[model].order === 'asc' ? 'desc' : 'asc';
        } else {
            state.sort[model].field = field;
            state.sort[model].order = 'asc';
        }
        return renderApp();
    }

    const navBtn = e.target.closest('[data-target-view]');
    if (navBtn) return setState({ currentView: navBtn.getAttribute('data-target-view'), selectedItem: null, modal: null });

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        
        if (action === 'logout') return setState({ currentUser: null, currentView: 'inbox', selectedItem: null });
        if (action === 'close-detail') return setState({ selectedItem: state.selectedItem.fromExpediente ? { ...state.db.expedientes.find(exp => exp.id === state.selectedItem.fromExpediente), type: 'expediente' } : null });
        if (action === 'view-item') {
            const id = actionBtn.getAttribute('data-id');
            const type = actionBtn.getAttribute('data-type');
            const coll = type === 'expediente' ? state.db.expedientes : state.db.documents;
            const item = coll.find(i => i.id === id);
            
            if (item && type === 'expediente' && !canViewExpediente(item, state.currentUser)) {
                return alert("Acceso denegado. Este expediente es reservado y usted no tiene permisos para visualizarlo.");
            }
            if (item) return setState({ selectedItem: { ...item, type, fromExpediente: state.selectedItem.id } });
        }
        
        if (action === 'acquire-item') {
            const id = actionBtn.getAttribute('data-id');
            const type = actionBtn.getAttribute('data-type');
            const coll = type === 'expediente' ? state.db.expedientes : state.db.documents;
            const item = coll.find(i => i.id === id);
            if (item) {
                if (type === 'expediente') {
                    item.currentOwnerId = state.currentUser.id;
                } else {
                    item.owners = item.owners.filter(oId => oId !== state.currentUser.areaId);
                    item.owners.push(state.currentUser.id);
                }
                item.history.push(createHistoryEntry(state.currentUser.id, 'Adquirido', 'Tomado desde la bandeja del área'));
                setState({});
            }
            return;
        }

        if (action === 'admin-del-user') {
            if(confirm('¿Eliminar usuario?')) {
                state.db.users = state.db.users.filter(u => u.id !== actionBtn.getAttribute('data-id'));
                setState({});
            }
            return;
        }
        if (action === 'admin-del-area') {
            if(confirm('¿Eliminar área?')) {
                state.db.areas = state.db.areas.filter(a => a.id !== actionBtn.getAttribute('data-id'));
                setState({});
            }
            return;
        }
        
        const saveEdits = () => {
            if (state.selectedItem && (state.selectedItem.status === STATUS.BORRADOR || state.selectedItem.status === STATUS.RECHAZADO || state.selectedItem.status === STATUS.FIRMANDOSE)) {
                const docIdx = state.db.documents.findIndex(d => d.id === state.selectedItem.id);
                state.db.documents[docIdx].subject = document.getElementById('edit-doc-subject').value;
                state.db.documents[docIdx].content = document.getElementById('edit-doc-content').value;
            }
        };

        if (action === 'open-modal') {
            saveEdits();
            const type = actionBtn.getAttribute('data-modal-type');
            let initialSelection = [];
            if (type === 'destinatarios') initialSelection = [...state.selectedItem.recipients];
            if (type === 'editar_permisos_exp') initialSelection = [...state.selectedItem.authAreas, ...state.selectedItem.authUsers];
            return setState({ modal: { type, search: '', selectedId: null, selectionArr: initialSelection, note: '' } });
        }
        if (action === 'close-modal') return setState({ modal: null });

        if (action === 'confirm-modal') {
            const m = state.modal;
            const isExp = state.selectedItem.type === 'expediente';
            const itemIdx = isExp ? state.db.expedientes.findIndex(e => e.id === state.selectedItem.id) : state.db.documents.findIndex(d => d.id === state.selectedItem.id);
            const item = isExp ? state.db.expedientes[itemIdx] : state.db.documents[itemIdx];

            if (m.type === 'destinatarios') {
                item.recipients = [...m.selectionArr];
                state.selectedItem.recipients = [...m.selectionArr]; 
                return setState({ modal: null });
            }
            
            if (m.type === 'editar_permisos_exp') {
                item.authAreas = m.selectionArr.filter(id => id.startsWith('a'));
                item.authUsers = m.selectionArr.filter(id => id.startsWith('u'));
                return setState({ modal: null });
            }

            if (m.type === 'revisar' || m.type === 'derivar_exp') {
                if (!m.selectedId) return alert("Debe seleccionar un destino.");
                if (!m.note.trim()) return alert("Debe ingresar un motivo.");
                
                item.currentOwnerId = m.selectedId;
                if (m.type === 'revisar') {
                    item.status = STATUS.BORRADOR;
                }
                
                let hAction = m.type === 'revisar' ? 'Enviado a Revisar' : 'Derivar';
                
                if (m.type === 'derivar_exp') {
                    item.sealedDocs = [...new Set([...(item.sealedDocs || []), ...item.linkedDocs])];
                }

                item.history.push(createHistoryEntry(state.currentUser.id, hAction, m.note));
                return setState({ modal: null, selectedItem: null, currentView: 'inbox' });
            }

            if (m.type === 'enviar_firmar') {
                if (m.selectionArr.length === 0) return alert("Debe seleccionar al menos un firmante.");
                if (!m.note.trim()) return alert("Debe ingresar un motivo.");
                
                item.signatories = m.selectionArr;
                item.status = STATUS.FIRMANDOSE;
                item.currentOwnerId = item.signatories[0];
                item.history.push(createHistoryEntry(state.currentUser.id, 'Enviado a firmar', m.note));
                return setState({ modal: null, selectedItem: null, currentView: 'inbox' });
            }

            if (m.type === 'derivar_doc') {
                if (m.selectionArr.length === 0) return alert("Debe seleccionar al menos un destino.");
                if (!m.note.trim()) return alert("Debe ingresar un motivo.");
                
                item.owners = [...new Set([...(item.owners || []), ...m.selectionArr])];
                item.history.push(createHistoryEntry(state.currentUser.id, 'Derivar', m.note));
                return setState({ modal: null, selectedItem: null, currentView: 'inbox' });
            }
            
            if (m.type === 'vincular_doc') {
                if (m.selectionArr.length === 0) return alert("Debe seleccionar al menos un documento.");
                m.selectionArr.forEach(docId => {
                    const doc = state.db.documents.find(d => d.id === docId);
                    if (!item.linkedDocs.includes(doc.id)) {
                        item.linkedDocs.push(doc.id);
                        item.history.push(createHistoryEntry(state.currentUser.id, 'Foja Vinculada', `Nro: ${doc.number}`));
                        doc.history.push(createHistoryEntry(state.currentUser.id, 'Vinculado a Expediente', `Exp: ${item.number}`));
                    }
                });
                state.selectedItem.linkedDocs = item.linkedDocs;
                return setState({ modal: null });
            }

            if (m.type === 'relacionar_doc') {
                if (m.selectionArr.length === 0) return alert("Debe seleccionar al menos un documento.");
                m.selectionArr.forEach(docId => {
                    const doc2 = state.db.documents.find(d => d.id === docId);
                    if (!item.relatedDocs) item.relatedDocs = [];
                    if (!item.relatedDocs.includes(doc2.id)) {
                        item.relatedDocs.push(doc2.id);
                    }
                });
                state.selectedItem.relatedDocs = item.relatedDocs;
                return setState({ modal: null });
            }

            if (['archivar_doc', 'anular_doc', 'archivar_exp', 'anular_exp', 'rechazar_doc'].includes(m.type)) {
                if (!m.note.trim()) return alert("Debe ingresar un motivo obligatorio.");
                let newStatus = ''; let actionName = '';
                if (m.type.includes('archivar')) { newStatus = STATUS.ARCHIVADO; actionName = 'Archivado'; }
                if (m.type.includes('anular')) { newStatus = STATUS.ANULADO; actionName = 'Anulado'; }
                if (m.type === 'rechazar_doc') { 
                    newStatus = STATUS.RECHAZADO; 
                    actionName = 'Rechazado'; 
                    item.currentOwnerId = item.creatorId; 
                }
                
                item.status = newStatus;
                if (m.type === 'archivar_exp') item.sealedDocs = [...new Set([...(item.sealedDocs || []), ...item.linkedDocs])];
                
                item.history.push(createHistoryEntry(state.currentUser.id, actionName, m.note));
                return setState({ modal: null, selectedItem: null, currentView: m.type.includes('archivar') ? 'archive' : 'inbox' });
            }
        }

        if (state.selectedItem) {
            const isExp = state.selectedItem.type === 'expediente';
            const itemIdx = isExp ? state.db.expedientes.findIndex(e => e.id === state.selectedItem.id) : state.db.documents.findIndex(d => d.id === state.selectedItem.id);
            const item = isExp ? state.db.expedientes[itemIdx] : state.db.documents[itemIdx];

            if (action === 'doc-sign-direct' || action === 'doc-sign-pending') {
                saveEdits();
                const isConDest = DOC_TYPES.CON_DEST.includes(item.docType);
                if (isConDest && item.recipients.length === 0) return alert("Debe añadir al menos un destinatario.");
                
                if (!item.signedBy) item.signedBy = [];
                item.signedBy.push({ id: state.currentUser.id, date: new Date().toISOString() });

                if (action === 'doc-sign-pending') {
                    item.signatories = item.signatories.filter(id => id !== state.currentUser.id);
                    if (item.signatories.length > 0) {
                        item.currentOwnerId = item.signatories[0];
                        item.history.push(createHistoryEntry(state.currentUser.id, 'Firma Aplicada', 'Pasa al siguiente firmante'));
                        return setState({ selectedItem: null, currentView: 'inbox' });
                    }
                }

                item.status = STATUS.FIRMADO;
                if (!item.number) item.number = generateNumber(item.docType, getAreaName(state.currentUser.areaId));

                if (item.relatedDocs && item.relatedDocs.length > 0) {
                    item.relatedDocs.forEach(relId => {
                        const targetDoc = state.db.documents.find(d => d.id === relId);
                        if (targetDoc) {
                            if (!targetDoc.relatedDocs) targetDoc.relatedDocs = [];
                            if (!targetDoc.relatedDocs.includes(item.id)) {
                                targetDoc.relatedDocs.push(item.id);
                            }
                        }
                    });
                }

                item.owners = isConDest ? [...item.recipients] : [item.creatorId];
                item.history.push(createHistoryEntry(state.currentUser.id, action === 'doc-sign-direct' ? 'Firma Directa' : 'Firma Completa', 'Documento sellado digitalmente'));
                setState({ selectedItem: null, currentView: 'inbox' });
            }
            else if (action === 'doc-delete') {
                if (!confirm('¿Está seguro de que desea eliminar este borrador permanentemente?')) return;
                item.status = STATUS.ELIMINADO;
                item.history.push(createHistoryEntry(state.currentUser.id, 'Eliminado', 'Borrador eliminado permanentemente'));
                setState({ selectedItem: null, currentView: 'drafts' });
            }
            else if (action === 'doc-unrelate') {
                if (!confirm('¿Seguro que desea eliminar esta relación?')) return;
                const docId = actionBtn.getAttribute('data-id');
                item.relatedDocs = item.relatedDocs.filter(id => id !== docId);
                state.selectedItem.relatedDocs = item.relatedDocs;
                setState({});
            }
            else if (action === 'exp-desarchivar') {
                item.status = 'En Tramite';
                item.history.push(createHistoryEntry(state.currentUser.id, 'Desarchivado', 'Se recuperó el expediente para nuevo trámite'));
                setState({ selectedItem: null, currentView: 'archive' });
            }
            else if (action === 'exp-unlink') {
                const docId = actionBtn.getAttribute('data-id');
                item.linkedDocs = item.linkedDocs.filter(id => id !== docId);
                state.selectedItem.linkedDocs = item.linkedDocs;
                const doc = state.db.documents.find(d => d.id === docId);
                item.history.push(createHistoryEntry(state.currentUser.id, 'Foja Desvinculada', `Nro: ${doc.number}`));
                doc.history.push(createHistoryEntry(state.currentUser.id, 'Desvinculado de Expediente', `Exp: ${item.number}`));
                setState({});
            }
        }
        return;
    }

    const tr = e.target.closest('tr[data-id]');
    if (tr) {
        const id = tr.getAttribute('data-id');
        const type = tr.getAttribute('data-type') || (id.startsWith('exp') ? 'expediente' : 'documento');
        const coll = type === 'expediente' ? state.db.expedientes : state.db.documents;
        const item = coll.find(i => i.id === id);
        if (item) {
            activeInputSelector = null;
            setState({ selectedItem: { ...item, type } });
        }
    }
});

renderApp();