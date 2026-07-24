import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
    getDatabase,
    ref,
    onValue,
    onDisconnect,
    set,
    serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { getFirebaseApp } from './firebase-init.js';

function usuarioTieneAcceso(user) {
    return !!user && !!user.emailVerified;
}

function iniciarPresencia(db, user) {
    const statusRef = ref(db, `status/${user.uid}`);
    const connectedRef = ref(db, '.info/connected');

    const offlineData = { state: 'offline', lastChanged: serverTimestamp() };
    const onlineData = {
        state: 'online',
        lastChanged: serverTimestamp(),
        displayName: user.displayName || user.email || 'Usuario',
        photoURL: user.photoURL || '',
    };

    return onValue(connectedRef, (snap) => {
        if (snap.val() === false) return;
        onDisconnect(statusRef).set(offlineData).then(() => {
            set(statusRef, onlineData);
        });
    });
}

function crearItemUsuario(usuario) {
    const li = document.createElement('li');
    li.className = 'online-user-item';

    const avatar = document.createElement('img');
    avatar.className = 'online-user-avatar';
    avatar.src = usuario.photoURL || '';
    avatar.alt = '';
    avatar.referrerPolicy = 'no-referrer';

    const dot = document.createElement('span');
    dot.className = 'online-user-dot';

    const nombre = document.createElement('span');
    nombre.className = 'online-user-name';
    nombre.textContent = usuario.displayName || 'Usuario';

    li.append(avatar, dot, nombre);
    return li;
}

function renderUsuariosEnLinea(usuarios) {
    const list = document.getElementById('online-users-list');
    if (!list) return;

    list.innerHTML = '';
    if (usuarios.length === 0) {
        const li = document.createElement('li');
        li.className = 'online-users-empty';
        li.textContent = 'No hay nadie más en línea ahora.';
        list.appendChild(li);
        return;
    }
    usuarios.forEach((usuario) => list.appendChild(crearItemUsuario(usuario)));
}

function escucharUsuariosEnLinea(db) {
    const statusRef = ref(db, 'status');
    onValue(statusRef, (snapshot) => {
        const usuarios = [];
        snapshot.forEach((child) => {
            const val = child.val();
            if (val && val.state === 'online') usuarios.push(val);
        });
        renderUsuariosEnLinea(usuarios);
    });
}

async function initPresence() {
    const app = await getFirebaseApp();
    const auth = getAuth(app);
    const db = getDatabase(app);
    let statusRef = null;

    onAuthStateChanged(auth, (user) => {
        if (!usuarioTieneAcceso(user)) return;
        statusRef = ref(db, `status/${user.uid}`);
        iniciarPresencia(db, user);
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => {
        if (statusRef) set(statusRef, { state: 'offline', lastChanged: serverTimestamp() }).catch(() => {});
    });
    document.getElementById('verify-logout-btn')?.addEventListener('click', () => {
        if (statusRef) set(statusRef, { state: 'offline', lastChanged: serverTimestamp() }).catch(() => {});
    });

    escucharUsuariosEnLinea(db);
}

initPresence();
