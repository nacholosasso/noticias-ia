import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';

let appPromise = null;

export function getFirebaseApp() {
    if (!appPromise) {
        appPromise = fetch('/__/firebase/init.json')
            .then((res) => res.json())
            .then((config) => initializeApp(config));
    }
    return appPromise;
}
