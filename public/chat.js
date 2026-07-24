import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
    getFirestore,
    collection,
    query,
    orderBy,
    limit,
    onSnapshot,
    addDoc,
    deleteDoc,
    doc,
    serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getFirebaseApp } from './firebase-init.js';

function usuarioTieneAcceso(user) {
    return !!user && !!user.emailVerified;
}

function crearMensaje(msg, uidActual) {
    const li = document.createElement('li');
    li.className = 'chat-message' + (msg.uid === uidActual ? ' chat-message-own' : '');

    const avatar = document.createElement('img');
    avatar.className = 'chat-message-avatar';
    avatar.src = msg.photoURL || '';
    avatar.alt = '';
    avatar.referrerPolicy = 'no-referrer';

    const body = document.createElement('div');
    body.className = 'chat-message-body';

    const autor = document.createElement('span');
    autor.className = 'chat-message-author';
    autor.textContent = msg.nombre || 'Usuario';

    const texto = document.createElement('p');
    texto.className = 'chat-message-text';
    texto.textContent = msg.texto || '';

    body.append(autor, texto);
    li.append(avatar, body);

    if (msg.uid === uidActual) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'chat-message-delete';
        delBtn.setAttribute('aria-label', 'Borrar mensaje');
        delBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        delBtn.addEventListener('click', () => msg.onDelete?.());
        li.appendChild(delBtn);
    }

    return li;
}

function renderMensajes(list, mensajes, uidActual) {
    const estabaAbajo = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    list.innerHTML = '';
    if (mensajes.length === 0) {
        const li = document.createElement('li');
        li.className = 'chat-messages-empty';
        li.textContent = 'Todavía no hay mensajes. ¡Arrancá la charla!';
        list.appendChild(li);
        return;
    }
    mensajes.forEach((msg) => list.appendChild(crearMensaje(msg, uidActual)));
    if (estabaAbajo) list.scrollTop = list.scrollHeight;
}

async function initChat() {
    const app = await getFirebaseApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const list = document.getElementById('chat-messages');
    if (!form || !input || !list) return;

    let unsubscribe = null;

    onAuthStateChanged(auth, (user) => {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }

        if (!usuarioTieneAcceso(user)) {
            list.innerHTML = '';
            const li = document.createElement('li');
            li.className = 'chat-messages-empty';
            li.textContent = 'Iniciá sesión para ver y mandar mensajes.';
            list.appendChild(li);
            form.style.display = 'none';
            return;
        }

        form.style.display = '';
        const q = query(collection(db, 'chatGlobal'), orderBy('creadoEn', 'desc'), limit(50));
        unsubscribe = onSnapshot(q, (snapshot) => {
            const mensajes = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
                onDelete: () => deleteDoc(doc(db, 'chatGlobal', d.id)).catch((err) => console.error('Error borrando mensaje:', err)),
            })).reverse();
            renderMensajes(list, mensajes, user.uid);
        }, (err) => console.error('Error escuchando el chat:', err));
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        const texto = input.value.trim();
        if (!usuarioTieneAcceso(user) || !texto) return;
        input.value = '';
        addDoc(collection(db, 'chatGlobal'), {
            texto: texto.slice(0, 500),
            uid: user.uid,
            nombre: user.displayName || user.email || 'Usuario',
            photoURL: user.photoURL || '',
            creadoEn: serverTimestamp(),
        }).catch((err) => console.error('Error enviando mensaje:', err));
    });
}

initChat();
