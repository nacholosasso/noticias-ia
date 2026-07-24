import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, doc, collection, getDocs, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getFirebaseApp } from './firebase-init.js';

const ERRORES_AUTH = {
    'auth/invalid-email': 'Ese email no es válido.',
    'auth/user-not-found': 'Email o contraseña incorrectos.',
    'auth/wrong-password': 'Email o contraseña incorrectos.',
    'auth/invalid-credential': 'Email o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese email. Probá iniciar sesión.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/too-many-requests': 'Demasiados intentos. Probá de nuevo en unos minutos.',
    'auth/popup-closed-by-user': null,
};

function mensajeError(err) {
    if (err.code in ERRORES_AUTH) return ERRORES_AUTH[err.code];
    return 'Ocurrió un error. Intentá de nuevo.';
}

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

function initAuthModal(auth) {
    const modal = document.getElementById('auth-modal');
    const form = document.getElementById('auth-form');
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const submitBtn = document.getElementById('auth-submit-btn');
    const errorEl = document.getElementById('auth-error');
    const infoEl = document.getElementById('auth-info');
    const tabs = document.querySelectorAll('.auth-tab');
    let modo = 'signin';

    function limpiarMensajes() {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
        infoEl.style.display = 'none';
        infoEl.textContent = '';
    }

    function mostrarError(texto) {
        if (!texto) return;
        errorEl.textContent = texto;
        errorEl.style.display = 'block';
    }

    function mostrarInfo(texto) {
        infoEl.textContent = texto;
        infoEl.style.display = 'block';
    }

    function abrirModal() {
        modal.style.display = 'flex';
        limpiarMensajes();
        emailInput.focus();
    }

    function cerrarModal() {
        modal.style.display = 'none';
        form.reset();
        limpiarMensajes();
    }

    function cambiarModo(nuevoModo) {
        modo = nuevoModo;
        tabs.forEach((tab) => tab.classList.toggle('active', tab.getAttribute('data-auth-tab') === modo));
        submitBtn.textContent = modo === 'signup' ? 'Crear cuenta' : 'Entrar';
        passwordInput.autocomplete = modo === 'signup' ? 'new-password' : 'current-password';
        limpiarMensajes();
    }

    document.getElementById('login-btn').addEventListener('click', abrirModal);
    document.getElementById('auth-modal-close').addEventListener('click', cerrarModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) cerrarModal();
    });

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => cambiarModo(tab.getAttribute('data-auth-tab')));
    });

    document.getElementById('google-signin-btn').addEventListener('click', () => {
        signInWithPopup(auth, new GoogleAuthProvider())
            .then(cerrarModal)
            .catch((err) => mostrarError(mensajeError(err)));
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        limpiarMensajes();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const accion = modo === 'signup'
            ? createUserWithEmailAndPassword(auth, email, password)
            : signInWithEmailAndPassword(auth, email, password);

        submitBtn.disabled = true;
        accion
            .then(cerrarModal)
            .catch((err) => mostrarError(mensajeError(err)))
            .finally(() => { submitBtn.disabled = false; });
    });

    document.getElementById('auth-forgot-btn').addEventListener('click', () => {
        limpiarMensajes();
        const email = emailInput.value.trim();
        if (!email) {
            mostrarError('Escribí tu email arriba para poder enviarte el link de recuperación.');
            return;
        }
        sendPasswordResetEmail(auth, email)
            .then(() => mostrarInfo('Te enviamos un email para restablecer tu contraseña.'))
            .catch((err) => mostrarError(mensajeError(err)));
    });
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

    initAuthModal(auth);

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
