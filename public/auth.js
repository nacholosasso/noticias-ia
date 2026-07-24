import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, doc, collection, getDocs, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getFirebaseApp } from './firebase-init.js';

async function subirLinksLocales(db, uid, links) {
    await Promise.all(links.map((link) =>
        setDoc(doc(db, 'usuarios', uid, 'leidos', encodeURIComponent(link)), {
            link,
            marcadoEn: serverTimestamp(),
        })
    ));
}

async function sincronizarLeidos(db, uid) {
    const snapshot = await getDocs(collection(db, 'usuarios', uid, 'leidos'));
    const linksFromServer = new Set(snapshot.docs.map((d) => d.data().link));

    if (typeof window.mergeReadLinksAndRerender !== 'function') return;
    const onlyLocal = window.mergeReadLinksAndRerender(linksFromServer);
    if (onlyLocal.length > 0) {
        await subirLinksLocales(db, uid, onlyLocal);
    }
}

function mostrarUsuario(user) {
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');

    if (user) {
        loginBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        userAvatar.src = user.photoURL || '';
        userName.textContent = user.displayName || user.email || '';
    } else {
        loginBtn.style.display = 'inline-flex';
        userInfo.style.display = 'none';
    }
}

async function initAuth() {
    const app = await getFirebaseApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    window.onReadLinkToggled = (link, isRead) => {
        const user = auth.currentUser;
        if (!user) return;
        const ref = doc(db, 'usuarios', user.uid, 'leidos', encodeURIComponent(link));
        const op = isRead
            ? setDoc(ref, { link, marcadoEn: serverTimestamp() })
            : deleteDoc(ref);
        op.catch((err) => console.error('Error sincronizando estado de leído:', err));
    };

    document.getElementById('login-btn').addEventListener('click', () => {
        signInWithPopup(auth, new GoogleAuthProvider()).catch((err) => {
            console.error('Login falló:', err);
        });
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        signOut(auth).catch((err) => console.error('Logout falló:', err));
    });

    onAuthStateChanged(auth, (user) => {
        mostrarUsuario(user);
        if (user) {
            sincronizarLeidos(db, user.uid).catch((err) => {
                console.error('Error sincronizando noticias leídas:', err);
            });
        }
    });
}

initAuth();
