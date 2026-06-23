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

function initApp() {
    const filterBtns = document.querySelectorAll('.filter-btn');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filterValue = btn.getAttribute('data-filter');
            const allCards = document.querySelectorAll('#news-container .news-card');
            let visibleCount = 0;

            allCards.forEach(card => {
                if (card.querySelector('.skeleton')) return;

                if (filterValue === 'all' || card.getAttribute('data-category') === filterValue) {
                    card.classList.remove('hidden');
                    visibleCount++;
                } else {
                    card.classList.add('hidden');
                }
            });

            let emptyMsg = document.getElementById('empty-filter-msg');
            if (visibleCount === 0 && allCards.length > 0 && !allCards[0].querySelector('.skeleton')) {
                if (!emptyMsg) {
                    emptyMsg = document.createElement('p');
                    emptyMsg.id = 'empty-filter-msg';
                    emptyMsg.style.cssText = 'grid-column: 1/-1; text-align:center; color: var(--text-secondary); padding: 2rem 0;';
                    emptyMsg.textContent = 'No hay noticias recientes para esta categoría.';
                    document.getElementById('news-container').appendChild(emptyMsg);
                } else {
                    emptyMsg.style.display = 'block';
                }
            } else if (emptyMsg) {
                emptyMsg.style.display = 'none';
            }
        });
    });

    setTimeout(() => {
        const newsContainer = document.getElementById('news-container');

        if (typeof firebase !== 'undefined') {
            if (typeof firebase.analytics === 'function') {
                firebase.analytics();
            }

            const db = firebase.firestore();

            db.collection('articulos')
                .orderBy('Fecha_Publicacion', 'desc')
                .limit(30)
                .get()
                .then((querySnapshot) => {
                    newsContainer.innerHTML = '';

                    if (querySnapshot.empty) {
                        newsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: var(--text-secondary);">No hay noticias disponibles en este momento.</p>';
                        return;
                    }

                    querySnapshot.forEach((doc) => {
                        const data = doc.data();
                        const articleEl = document.createElement('article');
                        articleEl.className = 'news-card';

                        const catClass = getCategoryClass(data.Categoria);
                        articleEl.setAttribute('data-category', catClass.replace('cat-', ''));
                        const titulo = data.Titulo || 'Sin título';
                        const resumen = data.Resumen_IA || data.Resumen_Web || 'Sin resumen disponible.';
                        const fuente = data.Diario || 'Fuente';
                        const link = data.Link || '#';
                        const categoriaTexto = data.Categoria || 'General';

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
                                <a href="${link}" target="_blank" rel="noopener noreferrer" class="read-more">
                                    Leer nota <i class="fa-solid fa-arrow-right"></i>
                                </a>
                            </div>
                        `;

                        newsContainer.appendChild(articleEl);
                    });
                })
                .catch((error) => {
                    console.error("Error obteniendo noticias:", error);
                    newsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: #ef4444;">Error de red al cargar noticias.</p>';
                });
        } else {
            newsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: var(--text-secondary);">La configuración de Firebase Hosting no ha cargado correctamente.</p>';
        }
    }, 300);
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initApp);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatTimeAgo, getCategoryClass, normalizeText, getUniqueDiarios };
}
