import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    sendEmailVerification,
    signOut,
    onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, doc, getDoc, collection, getDocs, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
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

function usuarioTieneAcceso(user) {
    return !!user && !!user.emailVerified;
}

function crearMensajero(errorEl, infoEl) {
    return {
        limpiar() {
            errorEl.style.display = 'none';
            errorEl.textContent = '';
            infoEl.style.display = 'none';
            infoEl.textContent = '';
        },
        mostrarError(texto) {
            if (!texto) return;
            errorEl.textContent = texto;
            errorEl.style.display = 'block';
        },
        mostrarInfo(texto) {
            infoEl.textContent = texto;
            infoEl.style.display = 'block';
        },
    };
}

// Asignada dentro de initAuthModal; onAuthStateChanged la llama en cada cambio de estado de auth.
let actualizarAcceso = () => {};

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

// El flag "premium" se activa a mano desde la consola de Firebase (ver README) cuando alguien paga la suscripción manual.
async function sincronizarPremium(db, uid) {
    try {
        const snap = await getDoc(doc(db, 'usuarios', uid));
        const esPremium = snap.exists() && snap.data().premium === true;
        if (typeof window.actualizarEstadoPremium === 'function') window.actualizarEstadoPremium(esPremium);
    } catch (err) {
        console.error('Error consultando estado premium:', err);
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
    const modalCloseBtn = document.getElementById('auth-modal-close');
    const loginBtn = document.getElementById('login-btn');
    const viewLogin = document.getElementById('auth-view-login');
    const viewVerify = document.getElementById('auth-view-verify');

    const form = document.getElementById('auth-form');
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const submitBtn = document.getElementById('auth-submit-btn');
    const errorEl = document.getElementById('auth-error');
    const infoEl = document.getElementById('auth-info');
    const tabs = document.querySelectorAll('.auth-tab');
    let modo = 'signin';
    const msgLogin = crearMensajero(errorEl, infoEl);

    const verifyEmailSpan = document.getElementById('verify-email-address');
    const verifyErrorEl = document.getElementById('verify-error');
    const verifyInfoEl = document.getElementById('verify-info');
    const resendBtn = document.getElementById('resend-verification-btn');
    const checkVerifiedBtn = document.getElementById('check-verified-btn');
    const verifyLogoutBtn = document.getElementById('verify-logout-btn');
    const msgVerify = crearMensajero(verifyErrorEl, verifyInfoEl);

    function mostrarVistaLogin() {
        viewLogin.style.display = 'block';
        viewVerify.style.display = 'none';
        msgLogin.limpiar();
    }

    function mostrarVistaVerificar(user) {
        viewLogin.style.display = 'none';
        viewVerify.style.display = 'block';
        verifyEmailSpan.textContent = user.email || '';
        msgVerify.limpiar();
    }

    function abrirModal() {
        modal.style.display = 'flex';
        mostrarVistaLogin();
    }

    function cerrarModal() {
        modal.style.display = 'none';
        form.reset();
        msgLogin.limpiar();
        msgVerify.limpiar();
    }

    loginBtn.addEventListener('click', abrirModal);
    modalCloseBtn.addEventListener('click', cerrarModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) cerrarModal();
    });

    // El login es opcional (las noticias se ven sin cuenta); esto solo reacciona a cambios de sesión
    // para cerrar el modal al loguearse o pedir la verificación de mail si hace falta.
    actualizarAcceso = function actualizarAccesoImpl(user) {
        if (!user) {
            cerrarModal();
            return;
        }
        if (usuarioTieneAcceso(user)) {
            cerrarModal();
            return;
        }
        user.reload()
            .then(() => {
                if (user.emailVerified) {
                    return user.getIdToken(true).then(() => actualizarAccesoImpl(auth.currentUser));
                }
                modal.style.display = 'flex';
                mostrarVistaVerificar(user);
            })
            .catch(() => {
                modal.style.display = 'flex';
                mostrarVistaVerificar(user);
            });
    };

    function cambiarModo(nuevoModo) {
        modo = nuevoModo;
        tabs.forEach((tab) => tab.classList.toggle('active', tab.getAttribute('data-auth-tab') === modo));
        submitBtn.textContent = modo === 'signup' ? 'Crear cuenta' : 'Entrar';
        passwordInput.autocomplete = modo === 'signup' ? 'new-password' : 'current-password';
        msgLogin.limpiar();
    }

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => cambiarModo(tab.getAttribute('data-auth-tab')));
    });

    document.getElementById('google-signin-btn').addEventListener('click', () => {
        signInWithPopup(auth, new GoogleAuthProvider())
            .catch((err) => msgLogin.mostrarError(mensajeError(err)));
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        msgLogin.limpiar();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const accion = modo === 'signup'
            ? createUserWithEmailAndPassword(auth, email, password)
            : signInWithEmailAndPassword(auth, email, password);

        submitBtn.disabled = true;
        accion
            .then((cred) => {
                if (modo === 'signup' && cred.user) {
                    return sendEmailVerification(cred.user).catch((err) => {
                        console.error('No se pudo enviar el email de verificación:', err);
                    });
                }
            })
            .catch((err) => msgLogin.mostrarError(mensajeError(err)))
            .finally(() => { submitBtn.disabled = false; });
    });

    document.getElementById('auth-forgot-btn').addEventListener('click', () => {
        msgLogin.limpiar();
        const email = emailInput.value.trim();
        if (!email) {
            msgLogin.mostrarError('Escribí tu email arriba para poder enviarte el link de recuperación.');
            return;
        }
        sendPasswordResetEmail(auth, email)
            .then(() => msgLogin.mostrarInfo('Te enviamos un email para restablecer tu contraseña.'))
            .catch((err) => msgLogin.mostrarError(mensajeError(err)));
    });

    resendBtn.addEventListener('click', () => {
        const user = auth.currentUser;
        if (!user) return;
        msgVerify.limpiar();
        resendBtn.disabled = true;
        sendEmailVerification(user)
            .then(() => msgVerify.mostrarInfo('Te reenviamos el email de verificación. Revisá tu bandeja de entrada (y spam).'))
            .catch((err) => msgVerify.mostrarError(mensajeError(err) || 'No pudimos reenviar el email, esperá un minuto e intentá de nuevo.'))
            .finally(() => { setTimeout(() => { resendBtn.disabled = false; }, 30000); });
    });

    checkVerifiedBtn.addEventListener('click', () => {
        const user = auth.currentUser;
        if (!user) return;
        msgVerify.limpiar();
        checkVerifiedBtn.disabled = true;
        user.reload()
            .then(() => user.getIdToken(true))
            .then(() => {
                checkVerifiedBtn.disabled = false;
                actualizarAcceso(auth.currentUser);
                if (!auth.currentUser.emailVerified) {
                    msgVerify.mostrarError('Todavía no detectamos la verificación. Revisá tu email y probá de nuevo en unos segundos.');
                }
            })
            .catch((err) => {
                checkVerifiedBtn.disabled = false;
                msgVerify.mostrarError(mensajeError(err) || 'No pudimos comprobar el estado, intentá de nuevo.');
            });
    });

    verifyLogoutBtn.addEventListener('click', () => {
        signOut(auth).catch((err) => console.error('Logout falló:', err));
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
        actualizarAcceso(user);
        if (usuarioTieneAcceso(user)) {
            sincronizarLeidos(db, user.uid).catch((err) => {
                console.error('Error sincronizando noticias leídas:', err);
            });
            sincronizarPremium(db, user.uid);
        } else if (typeof window.actualizarEstadoPremium === 'function') {
            window.actualizarEstadoPremium(false);
        }
    });
}

initAuth();
