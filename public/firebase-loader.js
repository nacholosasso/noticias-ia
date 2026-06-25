import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

async function cargarNoticias() {
    try {
        const configRes = await fetch('/__/firebase/init.json');
        const firebaseConfig = await configRes.json();
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const articulosQuery = query(collection(db, 'articulos'), orderBy('Fecha_Publicacion', 'desc'));
        const snapshot = await getDocs(articulosQuery);

        window.renderArticles(snapshot.docs.map((doc) => doc.data()));

        // Analytics cargado aparte y después de pintar las noticias para no competir por el hilo principal.
        import('https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js')
            .then(({ getAnalytics, isSupported }) => isSupported().then((supported) => supported && getAnalytics(app)))
            .catch(() => {});
    } catch (error) {
        console.error('Error obteniendo noticias:', error);
        window.renderNewsError();
    }
}

cargarNoticias();
