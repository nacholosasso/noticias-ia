function formatTimeAgo(dateInput) {
    if (!dateInput) return '';

    let date;
    if (typeof dateInput.toDate === 'function') {
        date = dateInput.toDate();
    } else {
        date = new Date(dateInput);
    }

    const diffInSeconds = Math.floor((new Date() - date) / 1000);

    if (diffInSeconds < 3600) {
        const mins = Math.max(1, Math.floor(diffInSeconds / 60));
        return `Hace ${mins} min`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `Hace ${hours} h`;
    } else {
        return date.toLocaleDateString();
    }
}

function normalizeText(str) {
    if (!str) return '';
    return str.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
}

const READ_STORAGE_KEY = 'noticiasIA_leidas';

function getReadLinks() {
    try {
        const raw = localStorage.getItem(READ_STORAGE_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

function toggleReadLink(link) {
    const readLinks = getReadLinks();
    if (readLinks.has(link)) {
        readLinks.delete(link);
    } else {
        readLinks.add(link);
    }
    try {
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...readLinks]));
    } catch {}
    const nowRead = readLinks.has(link);
    if (typeof window !== 'undefined' && typeof window.onReadLinkToggled === 'function') {
        window.onReadLinkToggled(link, nowRead);
    }
    return nowRead;
}

function mergeReadLinks(local, fromServer) {
    return new Set([...local, ...fromServer]);
}

function mergeReadLinksAndRerender(linksFromServer) {
    const local = getReadLinks();
    const onlyLocal = [...local].filter((link) => !linksFromServer.has(link));
    const merged = mergeReadLinks(local, linksFromServer);
    try {
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...merged]));
    } catch {}

    document.querySelectorAll('#news-container .news-card[data-link]').forEach((card) => {
        const link = card.getAttribute('data-link');
        const isRead = merged.has(link);
        card.classList.toggle('read', isRead);
        card.setAttribute('data-read', isRead ? 'true' : 'false');
        const btn = card.querySelector('.read-toggle');
        if (btn) {
            btn.setAttribute('aria-pressed', isRead ? 'true' : 'false');
            btn.title = isRead ? 'Marcar como no leída' : 'Marcar como leída';
            btn.innerHTML = `<i class="fa-solid fa-check"></i> ${isRead ? 'Leída' : 'Marcar leída'}`;
        }
    });
    applyFilters();

    return onlyLocal;
}

function getCategoryClass(cat) {
    if (!cat) return 'cat-general';

    const normalized = normalizeText(cat);
    const validCats = ['deportes', 'politica', 'economia', 'espectaculos', 'tecnologia', 'salud', 'sociedad'];

    return validCats.includes(normalized) ? `cat-${normalized}` : 'cat-general';
}

function getUniqueDiarios(articles) {
    const seen = new Map();
    articles.forEach(({ Diario }) => {
        if (!Diario) return;
        const value = normalizeText(Diario);
        if (!seen.has(value)) seen.set(value, Diario);
    });
    return Array.from(seen, ([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

function renderDiarioFilters(articlesData) {
    const diarioContainer = document.getElementById('diario-filters');
    const existing = new Set(
        [...diarioContainer.querySelectorAll('[data-diario-filter]')].map(b => b.getAttribute('data-diario-filter'))
    );
    getUniqueDiarios(articlesData).forEach(({ value, label }) => {
        if (existing.has(value)) return;
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.setAttribute('data-diario-filter', value);
        btn.innerHTML = `<i class="fa-solid fa-newspaper"></i> ${label}`;
        diarioContainer.appendChild(btn);
    });
}

function applyFilters() {
    const activeCategoryBtn = document.querySelector('#category-filters .filter-btn.active');
    const activeDiarioBtn = document.querySelector('#diario-filters .filter-btn.active');
    const activeReadBtn = document.querySelector('#read-filters .filter-btn.active');
    const activeCategoria = activeCategoryBtn ? activeCategoryBtn.getAttribute('data-filter') : 'all';
    const activeDiario = activeDiarioBtn ? activeDiarioBtn.getAttribute('data-diario-filter') : 'all';
    const activeLectura = activeReadBtn ? activeReadBtn.getAttribute('data-read-filter') : 'all';
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? normalizeText(searchInput.value.trim()) : '';

    const allCards = document.querySelectorAll('#news-container .news-card');
    let visibleCount = 0;

    allCards.forEach(card => {
        if (card.querySelector('.skeleton')) return;

        const matchCategoria = activeCategoria === 'all' || card.getAttribute('data-category') === activeCategoria;
        const matchDiario = activeDiario === 'all' || card.getAttribute('data-diario') === activeDiario;
        const matchBusqueda = searchTerm === '' || card.getAttribute('data-search').includes(searchTerm);
        const isRead = card.getAttribute('data-read') === 'true';
        const matchLectura = activeLectura === 'all' || (activeLectura === 'read' ? isRead : !isRead);
        const visible = matchCategoria && matchDiario && matchBusqueda && matchLectura;

        card.classList.toggle('hidden', !visible);
        if (visible) visibleCount++;
    });

    let emptyMsg = document.getElementById('empty-filter-msg');
    const hasRealCards = allCards.length > 0 && !allCards[0].querySelector('.skeleton');

    if (visibleCount === 0 && hasRealCards) {
        if (!emptyMsg) {
            emptyMsg = document.createElement('p');
            emptyMsg.id = 'empty-filter-msg';
            emptyMsg.style.cssText = 'grid-column: 1/-1; text-align:center; color: var(--text-secondary); padding: 2rem 0;';
            emptyMsg.textContent = 'No hay noticias que coincidan con los filtros seleccionados.';
            document.getElementById('news-container').appendChild(emptyMsg);
        } else {
            emptyMsg.style.display = 'block';
        }
    } else if (emptyMsg) {
        emptyMsg.style.display = 'none';
    }
}

function renderArticles(articlesData) {
    const newsContainer = document.getElementById('news-container');
    newsContainer.innerHTML = '';

    if (!articlesData || articlesData.length === 0) {
        newsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: var(--text-secondary);">No hay noticias disponibles en este momento.</p>';
        return;
    }

    const readLinks = getReadLinks();

    articlesData.forEach((data) => {
        const articleEl = document.createElement('article');

        const catClass = getCategoryClass(data.Categoria);
        articleEl.setAttribute('data-category', catClass.replace('cat-', ''));
        const titulo = data.Titulo || 'Sin título';
        const resumen = data.Resumen_IA || data.Resumen_Web || 'Sin resumen disponible.';
        const fuente = data.Diario || 'Fuente';
        const link = data.Link || '#';
        const categoriaTexto = data.Categoria || 'General';
        const isRead = readLinks.has(link);

        articleEl.className = `news-card${isRead ? ' read' : ''}`;
        articleEl.setAttribute('data-diario', normalizeText(data.Diario));
        articleEl.setAttribute('data-diario-label', data.Diario || '');
        articleEl.setAttribute('data-search', normalizeText(`${titulo} ${resumen}`));
        articleEl.setAttribute('data-link', link);
        articleEl.setAttribute('data-read', isRead ? 'true' : 'false');

        articleEl.innerHTML = `
            <div class="card-header">
                <div class="badges-wrapper">
                    <span class="diario-badge">${fuente}</span>
                    <span class="category ${catClass}">${categoriaTexto}</span>
                </div>
                <span class="date">${formatTimeAgo(data.Fecha_Publicacion)}</span>
            </div>
            <h3 class="news-title">${titulo}</h3>
            <p class="news-summary">${resumen}</p>
            <div class="card-footer">
                <button type="button" class="read-toggle" aria-pressed="${isRead}" title="${isRead ? 'Marcar como no leída' : 'Marcar como leída'}">
                    <i class="fa-solid fa-check"></i> ${isRead ? 'Leída' : 'Marcar leída'}
                </button>
                <a href="${link}" target="_blank" rel="noopener noreferrer" class="read-more">
                    Leer nota <i class="fa-solid fa-arrow-right"></i>
                </a>
            </div>
        `;

        newsContainer.appendChild(articleEl);
    });

    renderDiarioFilters(articlesData);
    applyFilters();
}

function appendArticles(articlesData) {
    if (!articlesData || articlesData.length === 0) return;
    const newsContainer = document.getElementById('news-container');
    const readLinks = getReadLinks();

    articlesData.forEach((data) => {
        const articleEl = document.createElement('article');
        const catClass = getCategoryClass(data.Categoria);
        const titulo = data.Titulo || 'Sin título';
        const resumen = data.Resumen_IA || data.Resumen_Web || 'Sin resumen disponible.';
        const fuente = data.Diario || 'Fuente';
        const link = data.Link || '#';
        const categoriaTexto = data.Categoria || 'General';
        const isRead = readLinks.has(link);

        articleEl.className = `news-card${isRead ? ' read' : ''}`;
        articleEl.setAttribute('data-category', catClass.replace('cat-', ''));
        articleEl.setAttribute('data-diario', normalizeText(data.Diario));
        articleEl.setAttribute('data-diario-label', data.Diario || '');
        articleEl.setAttribute('data-search', normalizeText(`${titulo} ${resumen}`));
        articleEl.setAttribute('data-link', link);
        articleEl.setAttribute('data-read', isRead ? 'true' : 'false');

        articleEl.innerHTML = `
            <div class="card-header">
                <div class="badges-wrapper">
                    <span class="diario-badge">${fuente}</span>
                    <span class="category ${catClass}">${categoriaTexto}</span>
                </div>
                <span class="date">${formatTimeAgo(data.Fecha_Publicacion)}</span>
            </div>
            <h3 class="news-title">${titulo}</h3>
            <p class="news-summary">${resumen}</p>
            <div class="card-footer">
                <button type="button" class="read-toggle" aria-pressed="${isRead}" title="${isRead ? 'Marcar como no leída' : 'Marcar como leída'}">
                    <i class="fa-solid fa-check"></i> ${isRead ? 'Leída' : 'Marcar leída'}
                </button>
                <a href="${link}" target="_blank" rel="noopener noreferrer" class="read-more">
                    Leer nota <i class="fa-solid fa-arrow-right"></i>
                </a>
            </div>
        `;

        newsContainer.appendChild(articleEl);
    });

    renderDiarioFilters(articlesData);
    applyFilters();
}

function renderNewsError() {
    const newsContainer = document.getElementById('news-container');
    newsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: #ef4444;">Error de red al cargar noticias.</p>';
}

if (typeof window !== 'undefined') {
    window.renderArticles = renderArticles;
    window.appendArticles = appendArticles;
    window.renderNewsError = renderNewsError;
    window.mergeReadLinksAndRerender = mergeReadLinksAndRerender;
}

function initApp() {
    document.getElementById('category-filters').addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        document.querySelectorAll('#category-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
    });

    document.getElementById('diario-filters').addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        document.querySelectorAll('#diario-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
    });

    document.getElementById('read-filters').addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        document.querySelectorAll('#read-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
    });

    document.getElementById('search-input').addEventListener('input', applyFilters);

    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            if (window.cargarMas) window.cargarMas();
        });
    }

    const loadAllBtn = document.getElementById('load-all-btn');
    if (loadAllBtn) {
        loadAllBtn.addEventListener('click', () => {
            if (window.cargarTodas) window.cargarTodas();
        });
    }

    document.getElementById('news-container').addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.read-toggle');
        if (!toggleBtn) return;
        const card = toggleBtn.closest('.news-card');
        if (!card) return;

        const isRead = toggleReadLink(card.getAttribute('data-link'));
        card.classList.toggle('read', isRead);
        card.setAttribute('data-read', isRead ? 'true' : 'false');
        toggleBtn.setAttribute('aria-pressed', isRead ? 'true' : 'false');
        toggleBtn.title = isRead ? 'Marcar como no leída' : 'Marcar como leída';
        toggleBtn.innerHTML = `<i class="fa-solid fa-check"></i> ${isRead ? 'Leída' : 'Marcar leída'}`;
        applyFilters();
    });

    initSidebarToggle();
    initLayoutToggles();
}

function initSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const closeBtn = document.getElementById('sidebar-close-btn');
    if (!sidebar || !overlay || !toggleBtn || !closeBtn) return;

    const openSidebar = () => {
        sidebar.classList.add('open');
        overlay.classList.add('visible');
        toggleBtn.setAttribute('aria-expanded', 'true');
        closeBtn.focus();
    };
    const closeSidebar = () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.focus();
    };

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });
    overlay.addEventListener('click', closeSidebar);
    closeBtn.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar();
    });
}

const FILTERS_HIDDEN_KEY = 'noticiasIA_ocultarFiltros';
const CHAT_HIDDEN_KEY = 'noticiasIA_ocultarChat';

function initLayoutToggles() {
    const layoutWrapper = document.querySelector('.layout-wrapper');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const reopenBtn = document.getElementById('sidebar-reopen-btn');
    const chatBtn = document.getElementById('chat-toggle-btn');
    if (!layoutWrapper) return;

    if (collapseBtn && reopenBtn) {
        const applyFiltersState = (hidden) => {
            layoutWrapper.classList.toggle('hide-left-sidebar', hidden);
            reopenBtn.style.display = hidden ? 'inline-flex' : 'none';
        };

        applyFiltersState(localStorage.getItem(FILTERS_HIDDEN_KEY) === 'true');

        collapseBtn.addEventListener('click', () => {
            localStorage.setItem(FILTERS_HIDDEN_KEY, 'true');
            applyFiltersState(true);
        });
        reopenBtn.addEventListener('click', () => {
            localStorage.setItem(FILTERS_HIDDEN_KEY, 'false');
            applyFiltersState(false);
        });
    }

    if (chatBtn) {
        const applyState = (hidden) => {
            layoutWrapper.classList.toggle('hide-right-sidebar', hidden);
            chatBtn.setAttribute('aria-pressed', hidden ? 'false' : 'true');
            chatBtn.title = hidden ? 'Mostrar chat' : 'Ocultar chat';
        };

        applyState(localStorage.getItem(CHAT_HIDDEN_KEY) === 'true');

        chatBtn.addEventListener('click', () => {
            const hidden = !layoutWrapper.classList.contains('hide-right-sidebar');
            localStorage.setItem(CHAT_HIDDEN_KEY, String(hidden));
            applyState(hidden);
        });
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initApp);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatTimeAgo, getCategoryClass, normalizeText, getUniqueDiarios, mergeReadLinks };
}
