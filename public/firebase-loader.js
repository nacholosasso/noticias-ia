import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, getDocs, query, orderBy, limit, startAfter } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const PAGE_SIZE = 25;
let db;
let lastDoc = null;
let isLoading = false;

async function cargarNoticias() {
    try {
        const configRes = await fetch('/__/firebase/init.json');
        const firebaseConfig = await configRes.json();
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);

        const articulosQuery = query(collection(db, 'articulos'), orderBy('Fecha_Publicacion', 'desc'), limit(PAGE_SIZE));
        const snapshot = await getDocs(articulosQuery);
        const docs = snapshot.docs;

        lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;
        window.renderArticles(docs.map((doc) => doc.data()));

        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = docs.length < PAGE_SIZE ? 'none' : 'inline-flex';
        }

        // Analytics cargado aparte y después de pintar las noticias para no competir por el hilo principal.
        import('https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js')
            .then(({ getAnalytics, isSupported }) => isSupported().then((supported) => supported && getAnalytics(app)))
            .catch(() => {});
    } catch (error) {
        console.error('Error obteniendo noticias:', error);
        window.renderNewsError();
    }
}

async function cargarMas() {
    if (isLoading || !lastDoc || !db) return;
    isLoading = true;

    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';
    }

    try {
        const articulosQuery = query(
            collection(db, 'articulos'),
            orderBy('Fecha_Publicacion', 'desc'),
            startAfter(lastDoc),
            limit(PAGE_SIZE)
        );
        const snapshot = await getDocs(articulosQuery);
        const docs = snapshot.docs;

        if (docs.length === 0) {
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            const noMoreMsg = document.getElementById('no-more-msg');
            if (noMoreMsg) noMoreMsg.style.display = 'block';
            return;
        }

        lastDoc = docs[docs.length - 1];
        window.appendArticles(docs.map((doc) => doc.data()));

        if (docs.length < PAGE_SIZE) {
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            const noMoreMsg = document.getElementById('no-more-msg');
            if (noMoreMsg) noMoreMsg.style.display = 'block';
        } else if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Cargar más noticias';
        }
    } catch (error) {
        console.error('Error cargando más noticias:', error);
        if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Cargar más noticias';
        }
    } finally {
        isLoading = false;
    }
}

window.cargarMas = cargarMas;
cargarNoticias();
