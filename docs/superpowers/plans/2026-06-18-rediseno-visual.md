# Rediseño Visual de Noticias IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevar el aspecto visual de `public/index.html` (único frontend del sitio) a un estilo "AI/Tech SaaS premium" con acento ámbar distintivo, manteniendo el sitio 100% estático sin build step.

**Architecture:** Sitio estático servido por Firebase Hosting desde `public/`. Se separa el HTML monolítico actual en `index.html` + `styles.css` + `app.js`. No se introduce ningún framework, bundler ni dependencia nueva. Las dos funciones puras de `app.js` (`formatTimeAgo`, `getCategoryClass`) se exponen también a Node vía un guard `module.exports` para poder testearlas con el test runner nativo de Node (`node --test`), sin agregar dependencias.

**Tech Stack:** HTML/CSS/JS vanilla, Font Awesome 6.4 (ya cargado por CDN), Google Fonts (Inter + JetBrains Mono), Firebase Hosting/Firestore (SDK compat, sin cambios), Node.js `node:test` + `node:assert` (built-in, solo para tests locales de las funciones puras).

## Global Constraints

- No agregar frameworks, bundlers ni dependencias npm — el `package.json` no existe hoy y no se crea uno; los tests corren con `node --test` directo sobre `public/app.test.js`.
- No cambiar el comportamiento funcional existente: fetch a Firestore (colección `articulos`, orderBy `Fecha_Publicacion` desc, limit 30), lógica de `formatTimeAgo`, `getCategoryClass`, filtros por categoría, e integración con Formspree (`https://formspree.io/f/mqewjeya`) quedan idénticos.
- Acento de marca: ámbar `#f5b942` (hover `#e0a52e`), reemplaza el celeste `#3b82f6` y el gradiente de 3 colores del `<h1>`.
- Los 8 colores de categoría (`--cat-deportes` `#10b981`, `--cat-politica` `#ef4444`, `--cat-economia` `#eab308`, `--cat-espectaculos` `#ec4899`, `--cat-tecnologia` `#3b82f6`, `--cat-salud` `#06b6d4`, `--cat-sociedad` `#8b5cf6`, `--cat-general` `#64748b`) no cambian.
- Texto sobre fondos ámbar sólidos (botones, estado activo) usa `var(--bg-color)` para contraste, no blanco.
- Todo cambio visual se verifica levantando el sitio con `npx serve public` y revisando en navegador (desktop + viewport de 480px). No hay manera de probar el fetch real de Firestore en local sin credenciales del proyecto Firebase — eso se deja para verificación post-deploy, no bloquea este plan.
- Spec completo: `docs/superpowers/specs/2026-06-18-rediseno-visual-design.md`.

---

## Task 1: Extraer HTML/CSS/JS a archivos separados + tests de las funciones puras

**Files:**
- Create: `public/styles.css`
- Create: `public/app.js`
- Create: `public/app.test.js`
- Modify: `public/index.html` (reemplaza el `<style>` inline por un `<link>`, y el `<script>` inline por un `<script src="app.js">`)

**Interfaces:**
- Produces: `formatTimeAgo(dateInput)` y `getCategoryClass(cat)` exportadas desde `public/app.js` vía `module.exports` (solo activo bajo Node; en el navegador `module` no existe y el guard no hace nada).
- Produces: clases CSS y variables `:root` ya existentes (`--bg-color`, `--accent-color`, `.news-card`, `.filter-btn`, etc.) ahora viven en `public/styles.css`, sin cambios de nombre — las tareas siguientes las modifican ahí.

- [ ] **Step 1: Escribir el test (falla porque `app.js` no existe todavía)**

Crear `public/app.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTimeAgo, getCategoryClass } = require('./app.js');

test('getCategoryClass normaliza tildes y mayúsculas', () => {
    assert.equal(getCategoryClass('Política'), 'cat-politica');
    assert.equal(getCategoryClass('ECONOMIA'), 'cat-economia');
});

test('getCategoryClass devuelve cat-general para categorías desconocidas o vacías', () => {
    assert.equal(getCategoryClass('Clima'), 'cat-general');
    assert.equal(getCategoryClass(null), 'cat-general');
    assert.equal(getCategoryClass(undefined), 'cat-general');
});

test('formatTimeAgo muestra minutos para diferencias menores a una hora', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    assert.equal(formatTimeAgo(fiveMinutesAgo), 'Hace 5 min');
});

test('formatTimeAgo muestra horas para diferencias menores a un día', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    assert.equal(formatTimeAgo(threeHoursAgo), 'Hace 3 h');
});

test('formatTimeAgo soporta objetos Firestore Timestamp con .toDate()', () => {
    const fakeTimestamp = { toDate: () => new Date(Date.now() - 10 * 60 * 1000) };
    assert.equal(formatTimeAgo(fakeTimestamp), 'Hace 10 min');
});

test('formatTimeAgo devuelve string vacío si no hay fecha', () => {
    assert.equal(formatTimeAgo(null), '');
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `node --test public/app.test.js`
Expected: FAIL — `Error: Cannot find module './app.js'`

- [ ] **Step 3: Crear `public/app.js` con la lógica extraída del `<script>` inline actual**

Crear `public/app.js`:

```js
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

function getCategoryClass(cat) {
    if (!cat) return 'cat-general';

    const normalized = cat.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");
    const validCats = ['deportes', 'politica', 'economia', 'espectaculos', 'tecnologia', 'salud', 'sociedad'];

    return validCats.includes(normalized) ? `cat-${normalized}` : 'cat-general';
}

function initApp() {
    document.getElementById('year').textContent = new Date().getFullYear();

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
    module.exports = { formatTimeAgo, getCategoryClass };
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `node --test public/app.test.js`
Expected: PASS — 7 tests, 0 failures

- [ ] **Step 5: Crear `public/styles.css` con el CSS extraído del `<style>` inline actual (sin cambios todavía)**

Crear `public/styles.css` copiando **exactamente** el contenido que hoy está entre `<style>` y `</style>` en `public/index.html` (todo el bloque `:root { ... }` hasta el último media query `@media (max-width: 850px) { ... }`), sin modificar ninguna regla. Es una extracción literal — las tareas siguientes van a editar este archivo.

- [ ] **Step 6: Modificar `public/index.html` para usar los archivos externos**

Reemplazar el bloque `<style>...</style>` completo (dentro de `<head>`) por:

```html
    <link rel="stylesheet" href="styles.css">
```

Reemplazar el `<script>...</script>` final (el que contiene `formatTimeAgo`, `getCategoryClass`, etc. — NO los tres `<script defer src="/__/firebase/...">`) por:

```html
    <script src="app.js"></script>
```

Este `<script>` debe quedar en la misma posición relativa que el original: inmediatamente después de los tres scripts de Firebase, al final de `<body>`. No agregar `defer` — debe ejecutarse de forma síncrona en ese punto, igual que el inline original.

- [ ] **Step 7: Verificar visualmente que el sitio se ve idéntico**

Run: `npx serve public` y abrir `http://localhost:3000` en el navegador.
Expected: la página se ve exactamente igual que antes de la extracción (mismo layout, colores, skeletons). Si hay errores en la consola del navegador sobre `styles.css` o `app.js` no encontrados, revisar las rutas (deben ser relativas, sin `/` inicial, ya que ambos archivos están en `public/` junto a `index.html`).

- [ ] **Step 8: Commit**

```bash
git add public/styles.css public/app.js public/app.test.js public/index.html
git commit -m "refactor: separa HTML/CSS/JS de index.html en archivos propios"
```

---

## Task 2: Sistema de color y tipografía — fundación (variables, fuentes, header, hero base)

**Files:**
- Modify: `public/styles.css`
- Modify: `public/index.html`

**Interfaces:**
- Produces: variable `--font-mono` y acento `--accent-color: #f5b942` disponibles para todas las tareas siguientes.
- Consumes: `:root` block creado en Task 1.

- [ ] **Step 1: Agregar la fuente JetBrains Mono en `public/index.html`**

En `<head>`, reemplazar:

```html
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

por:

```html
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Actualizar las variables de color en `public/styles.css`**

Reemplazar el bloque `:root { ... }` actual por:

```css
:root {
    --bg-color: #0a0e16;
    --surface-color: #161b26;
    --surface-hover: #232a3a;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --accent-color: #f5b942;
    --accent-hover: #e0a52e;
    --accent-soft: rgba(245, 185, 66, 0.15);
    --border-color: #232a3a;
    --font-mono: 'JetBrains Mono', monospace;

    /* Colores de Categorías */
    --cat-deportes: #10b981;
    --cat-politica: #ef4444;
    --cat-economia: #eab308;
    --cat-espectaculos: #ec4899;
    --cat-tecnologia: #3b82f6;
    --cat-salud: #06b6d4;
    --cat-sociedad: #8b5cf6;
    --cat-general: #64748b;
}
```

- [ ] **Step 3: Quitar el gradiente del logo del header**

En `public/index.html`, dentro de `.logo`, ya usa `var(--accent-color)` para el ícono del robot — no requiere cambio de HTML, solo confirmar que sigue así:

```html
            <a href="#" class="logo">
                Noticias IA <i class="fa-solid fa-robot" style="color: var(--accent-color);"></i>
            </a>
```

(Sin cambios — el ícono ya hereda el nuevo ámbar automáticamente vía la variable.)

- [ ] **Step 4: Reescribir el hero — quitar gradiente de 3 colores, agregar glow de fondo**

En `public/styles.css`, reemplazar:

```css
        .hero {
            text-align: center;
            margin-bottom: 4rem;
        }

        .hero h1 {
            font-size: 2.75rem;
            font-weight: 800;
            margin-bottom: 1rem;
            background: linear-gradient(135deg, #60a5fa, #a78bfa, #f472b6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.5px;
        }
```

por:

```css
        .hero {
            position: relative;
            text-align: center;
            margin-bottom: 4rem;
        }

        .hero::before {
            content: '';
            position: absolute;
            top: -2rem;
            left: 50%;
            transform: translateX(-50%);
            width: 600px;
            height: 360px;
            max-width: 90vw;
            background: radial-gradient(circle, rgba(245, 185, 66, 0.12), transparent 70%);
            pointer-events: none;
            z-index: -1;
        }

        .hero h1 {
            font-size: 2.75rem;
            font-weight: 800;
            margin-bottom: 1rem;
            color: var(--text-primary);
            letter-spacing: -0.5px;
        }

        .hero h1 .highlight {
            color: var(--accent-color);
        }
```

- [ ] **Step 5: Actualizar el `<h1>` del hero en `public/index.html`**

Reemplazar:

```html
            <h1>La información al instante</h1>
```

por:

```html
            <h1>La información al <span class="highlight">instante</span></h1>
```

- [ ] **Step 6: Verificar visualmente**

Run: `npx serve public`, abrir en navegador.
Expected: título en blanco con "instante" en ámbar, glow sutil detrás del hero, sin gradiente azul/violeta/rosa, ícono del logo en ámbar.

- [ ] **Step 7: Commit**

```bash
git add public/styles.css public/index.html
git commit -m "feat: nueva paleta ámbar y tipografía mono, quita gradiente del hero"
```

---

## Task 3: Badges de credibilidad en el hero (indicador "en vivo")

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: `--font-mono`, `--accent-color`, `--surface-color`, `--border-color` (Task 2).

- [ ] **Step 1: Agregar el HTML de los badges en el hero**

En `public/index.html`, dentro de `.hero`, después del `<p>`:

```html
        <section class="hero" id="noticias">
            <h1>La información al <span class="highlight">instante</span></h1>
            <p>Las noticias más relevantes de Argentina leídas, analizadas, categorizadas y resumidas por Inteligencia Artificial en tiempo real.</p>
            <div class="hero-badges">
                <span class="hero-badge"><span class="live-dot"></span>En vivo</span>
                <span class="hero-badge">Actualizado cada hora</span>
                <span class="hero-badge">Gemini AI</span>
            </div>
        </section>
```

- [ ] **Step 2: Agregar el CSS de los badges**

En `public/styles.css`, después de la regla `.hero p { ... }`, agregar:

```css
        .hero-badges {
            display: flex;
            justify-content: center;
            gap: 0.75rem;
            flex-wrap: wrap;
            margin-top: 1.75rem;
        }

        .hero-badge {
            font-family: var(--font-mono);
            font-size: 0.75rem;
            color: var(--text-secondary);
            background-color: var(--surface-color);
            border: 1px solid var(--border-color);
            padding: 0.4rem 0.9rem;
            border-radius: 20px;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            letter-spacing: 0.3px;
        }

        .live-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background-color: var(--cat-deportes);
            animation: pulse-dot 2s infinite;
        }

        @keyframes pulse-dot {
            0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
            70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
```

- [ ] **Step 3: Verificar visualmente**

Run: `npx serve public`, abrir en navegador.
Expected: tres badges debajo del subtítulo del hero, el primero con un punto verde pulsante ("En vivo"), tipografía monoespaciada visible.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/styles.css
git commit -m "feat: agrega badges de credibilidad al hero (en vivo, actualizado, Gemini AI)"
```

---

## Task 4: Filtros — ícono por categoría y estado activo en ámbar

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: `--accent-color`, `--bg-color` (Task 2). No cambia la lógica de `app.js` (los `data-filter` se mantienen idénticos).

- [ ] **Step 1: Agregar íconos a los botones de filtro**

En `public/index.html`, reemplazar el bloque `.filters-container` por:

```html
        <div class="filters-container">
            <button class="filter-btn active" data-filter="all"><i class="fa-solid fa-layer-group"></i> Todas</button>
            <button class="filter-btn" data-filter="politica"><i class="fa-solid fa-landmark"></i> Política</button>
            <button class="filter-btn" data-filter="economia"><i class="fa-solid fa-chart-line"></i> Economía</button>
            <button class="filter-btn" data-filter="deportes"><i class="fa-solid fa-futbol"></i> Deportes</button>
            <button class="filter-btn" data-filter="espectaculos"><i class="fa-solid fa-star"></i> Espectáculos</button>
            <button class="filter-btn" data-filter="tecnologia"><i class="fa-solid fa-microchip"></i> Tecnología</button>
            <button class="filter-btn" data-filter="salud"><i class="fa-solid fa-heart-pulse"></i> Salud</button>
            <button class="filter-btn" data-filter="sociedad"><i class="fa-solid fa-people-group"></i> Sociedad</button>
            <button class="filter-btn" data-filter="general"><i class="fa-solid fa-newspaper"></i> General</button>
        </div>
```

(El JS de `app.js` no cambia: sigue leyendo `data-filter` y `.filter-btn`/`.active` igual que antes.)

- [ ] **Step 2: Ajustar el CSS de los filtros**

En `public/styles.css`, reemplazar:

```css
        .filter-btn {
            background-color: var(--surface-color);
            color: var(--text-secondary);
            border: 1px solid var(--border-color);
            padding: 0.5rem 1.2rem;
            border-radius: 30px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .filter-btn:hover {
            border-color: var(--text-secondary);
            color: var(--text-primary);
        }

        .filter-btn.active {
            background-color: var(--accent-color);
            color: white;
            border-color: var(--accent-color);
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }
```

por:

```css
        .filter-btn {
            background-color: var(--surface-color);
            color: var(--text-secondary);
            border: 1px solid var(--border-color);
            padding: 0.5rem 1.2rem;
            border-radius: 30px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.3s ease;
        }

        .filter-btn:hover {
            border-color: var(--text-secondary);
            color: var(--text-primary);
        }

        .filter-btn.active {
            background-color: var(--accent-color);
            color: var(--bg-color);
            border-color: var(--accent-color);
            box-shadow: 0 4px 12px rgba(245, 185, 66, 0.35);
        }
```

- [ ] **Step 3: Verificar visualmente**

Run: `npx serve public`, abrir en navegador.
Expected: cada filtro tiene un ícono a la izquierda del texto; el filtro activo ("Todas" por defecto) tiene fondo ámbar con texto oscuro; al hacer clic en otro filtro, el filtrado de cards sigue funcionando igual que antes.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/styles.css
git commit -m "feat: agrega íconos a los filtros y estado activo en ámbar"
```

---

## Task 5: Cards de noticias — acento por categoría, hover e ingreso animado

**Files:**
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: atributo `data-category` que `app.js` ya setea en cada card (sin cambios en `app.js`).

- [ ] **Step 1: Agregar borde-acento izquierdo por categoría**

En `public/styles.css`, en la regla `.news-card`, agregar `border-left`:

Reemplazar:

```css
        .news-card {
            background-color: var(--surface-color);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 1.75rem;
            transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
            display: flex;
            flex-direction: column;
            position: relative;
        }

        .news-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
            border-color: var(--accent-color);
        }
```

por:

```css
        .news-card {
            background-color: var(--surface-color);
            border: 1px solid var(--border-color);
            border-left: 3px solid var(--border-color);
            border-radius: 16px;
            padding: 1.75rem;
            transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
            display: flex;
            flex-direction: column;
            position: relative;
            animation: card-in 0.4s ease both;
        }

        .news-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
            border-color: var(--accent-color);
        }

        @keyframes card-in {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .news-card[data-category="deportes"] { border-left-color: var(--cat-deportes); }
        .news-card[data-category="politica"] { border-left-color: var(--cat-politica); }
        .news-card[data-category="economia"] { border-left-color: var(--cat-economia); }
        .news-card[data-category="espectaculos"] { border-left-color: var(--cat-espectaculos); }
        .news-card[data-category="tecnologia"] { border-left-color: var(--cat-tecnologia); }
        .news-card[data-category="salud"] { border-left-color: var(--cat-salud); }
        .news-card[data-category="sociedad"] { border-left-color: var(--cat-sociedad); }
        .news-card[data-category="general"] { border-left-color: var(--cat-general); }

        .news-card[data-category="deportes"]:hover { border-color: var(--cat-deportes); box-shadow: 0 12px 30px rgba(16, 185, 129, 0.25); }
        .news-card[data-category="politica"]:hover { border-color: var(--cat-politica); box-shadow: 0 12px 30px rgba(239, 68, 68, 0.25); }
        .news-card[data-category="economia"]:hover { border-color: var(--cat-economia); box-shadow: 0 12px 30px rgba(234, 179, 8, 0.25); }
        .news-card[data-category="espectaculos"]:hover { border-color: var(--cat-espectaculos); box-shadow: 0 12px 30px rgba(236, 72, 153, 0.25); }
        .news-card[data-category="tecnologia"]:hover { border-color: var(--cat-tecnologia); box-shadow: 0 12px 30px rgba(59, 130, 246, 0.25); }
        .news-card[data-category="salud"]:hover { border-color: var(--cat-salud); box-shadow: 0 12px 30px rgba(6, 182, 212, 0.25); }
        .news-card[data-category="sociedad"]:hover { border-color: var(--cat-sociedad); box-shadow: 0 12px 30px rgba(139, 92, 246, 0.25); }
        .news-card[data-category="general"]:hover { border-color: var(--cat-general); box-shadow: 0 12px 30px rgba(100, 116, 139, 0.25); }
```

Nota: los 3 `.news-card` de skeleton en `index.html` no tienen atributo `data-category`, así que conservan el borde gris por defecto (`var(--border-color)`) — correcto, son placeholders de carga.

- [ ] **Step 2: Verificar visualmente**

Run: `npx serve public`, abrir en navegador. Como no hay credenciales de Firebase en local, solo se van a ver los 3 skeletons — confirmar que tienen la animación de entrada (fade + slide sutil) y el borde izquierdo gris. Para confirmar el color por categoría, inspeccionar con devtools: agregar manualmente `data-category="deportes"` a un `.news-card` desde la consola y confirmar que el borde izquierdo se pone verde y el hover muestra sombra verde.

- [ ] **Step 3: Commit**

```bash
git add public/styles.css
git commit -m "feat: borde-acento y hover por categoría en cards, animación de ingreso"
```

---

## Task 6: Sección de contacto — badges de stack tecnológico y acentos ámbar

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: `--accent-color`, `--accent-soft`, `--font-mono`, `--bg-color` (Task 2).

- [ ] **Step 1: Agregar los badges de stack tecnológico**

En `public/index.html`, dentro de `.contact-info`, entre el `<p>` y `.social-links`:

```html
            <div class="contact-info">
                <h2>¿Tenés una idea o proyecto?</h2>
                <p>Me apasiona desarrollar soluciones que integren Inteligencia Artificial, automatización y un sólido diseño visual. Hablemos y llevemos tu idea al próximo nivel.</p>

                <div class="tech-stack">
                    <span class="tech-badge">Python</span>
                    <span class="tech-badge">Gemini AI</span>
                    <span class="tech-badge">Firebase</span>
                    <span class="tech-badge">Cloud Run</span>
                </div>

                <div class="social-links">
```

(El resto de `.social-links` no cambia.)

- [ ] **Step 2: Ajustar el espaciado y agregar el CSS de los badges**

En `public/styles.css`, reemplazar:

```css
        .contact-info p {
            color: var(--text-secondary);
            margin-bottom: 2.5rem;
            font-size: 1.05rem;
        }
```

por:

```css
        .contact-info p {
            color: var(--text-secondary);
            margin-bottom: 1.5rem;
            font-size: 1.05rem;
        }

        .tech-stack {
            display: flex;
            gap: 0.6rem;
            flex-wrap: wrap;
            margin-bottom: 2.5rem;
        }

        .tech-badge {
            font-family: var(--font-mono);
            font-size: 0.75rem;
            color: var(--accent-color);
            background-color: var(--accent-soft);
            border: 1px solid rgba(245, 185, 66, 0.3);
            padding: 0.35rem 0.85rem;
            border-radius: 6px;
            letter-spacing: 0.3px;
        }
```

- [ ] **Step 3: Acentos ámbar en el formulario**

En `public/styles.css`, reemplazar:

```css
        .form-control:focus {
            outline: none;
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
        }
```

por:

```css
        .form-control:focus {
            outline: none;
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px rgba(245, 185, 66, 0.25);
        }
```

Reemplazar:

```css
        .btn-submit {
            width: 100%;
            padding: 1rem;
            background-color: var(--accent-color);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s, transform 0.2s;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 0.6rem;
        }
```

por:

```css
        .btn-submit {
            width: 100%;
            padding: 1rem;
            background-color: var(--accent-color);
            color: var(--bg-color);
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s, transform 0.2s;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 0.6rem;
        }
```

- [ ] **Step 4: Verificar visualmente**

Run: `npx serve public`, abrir en navegador, ir a la sección de contacto.
Expected: 4 badges de tecnología debajo del párrafo de contacto; al hacer foco en un input del formulario, el anillo de foco es ámbar; el botón "Enviar Mensaje" tiene fondo ámbar con texto oscuro.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/styles.css
git commit -m "feat: agrega badges de stack tecnológico y acentos ámbar al formulario de contacto"
```

---

## Task 7: Footer — tagline técnico y link a GitHub

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`

- [ ] **Step 1: Actualizar el HTML del footer**

Reemplazar:

```html
    <footer>
        <div class="container">
            <p>&copy; <span id="year"></span> Ignacio Lo Sasso. Todos los derechos reservados.</p>
        </div>
    </footer>
```

por:

```html
    <footer>
        <div class="container footer-content">
            <p>&copy; <span id="year"></span> Ignacio Lo Sasso. Todos los derechos reservados.</p>
            <p class="footer-tech">Hecho con Python + Gemini AI · <a href="https://github.com/nacholosasso/noticias-ia" target="_blank" rel="noopener noreferrer">Ver en GitHub</a></p>
        </div>
    </footer>
```

- [ ] **Step 2: Agregar el CSS del footer**

En `public/styles.css`, reemplazar:

```css
        footer {
            text-align: center;
            padding: 2rem 0;
            background-color: var(--bg-color);
            color: var(--text-secondary);
            font-size: 0.875rem;
        }
```

por:

```css
        footer {
            text-align: center;
            padding: 2rem 0;
            background-color: var(--bg-color);
            color: var(--text-secondary);
            font-size: 0.875rem;
        }

        .footer-content {
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
            align-items: center;
        }

        .footer-tech {
            font-family: var(--font-mono);
            font-size: 0.8rem;
        }

        .footer-tech a {
            color: var(--accent-color);
            text-decoration: none;
        }

        .footer-tech a:hover {
            text-decoration: underline;
        }
```

- [ ] **Step 3: Verificar visualmente**

Run: `npx serve public`, abrir en navegador, scrollear al footer.
Expected: línea de copyright + debajo, en mono font, "Hecho con Python + Gemini AI · Ver en GitHub" con el link en ámbar. Confirmar que el link abre `https://github.com/nacholosasso/noticias-ia` en una pestaña nueva.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/styles.css
git commit -m "feat: agrega tagline técnico y link a GitHub en el footer"
```

---

## Task 8: Restyle de `public/404.html`

**Files:**
- Modify: `public/404.html`

- [ ] **Step 1: Reemplazar el contenido completo de `public/404.html`**

```html
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Página no encontrada — Noticias IA</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', sans-serif; }
      body {
        background-color: #0a0e16;
        color: #f8fafc;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 1.5rem;
      }
      #message { max-width: 420px; }
      #message h2 { font-size: 4rem; font-weight: 800; color: #f5b942; margin-bottom: 0.5rem; }
      #message h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; }
      #message p { color: #94a3b8; line-height: 1.6; margin-bottom: 2rem; }
      #message a {
        display: inline-block;
        background-color: #f5b942;
        color: #0a0e16;
        text-decoration: none;
        font-weight: 600;
        padding: 0.85rem 1.75rem;
        border-radius: 8px;
        transition: background-color 0.2s;
      }
      #message a:hover { background-color: #e0a52e; }
    </style>
  </head>
  <body>
    <div id="message">
      <h2>404</h2>
      <h1>Página no encontrada</h1>
      <p>La página que buscás no existe o fue movida. Volvé al inicio para seguir leyendo las últimas noticias.</p>
      <a href="/">Volver al inicio</a>
    </div>
  </body>
</html>
```

- [ ] **Step 2: Verificar visualmente**

Run: `npx serve public` y abrir `http://localhost:3000/404.html` directamente en el navegador.
Expected: fondo oscuro, "404" en ámbar grande, botón "Volver al inicio" en ámbar con texto oscuro que lleva a `/`.

- [ ] **Step 3: Commit**

```bash
git add public/404.html
git commit -m "feat: restyle de 404.html acorde a la nueva marca"
```

---

## Task 9: Favicon y meta tags Open Graph

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Agregar el favicon SVG inline**

En `public/index.html`, dentro de `<head>`, antes del `<link>` de Google Fonts, agregar:

```html
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%230a0e16'/%3E%3Ctext x='50' y='68' font-family='Arial, sans-serif' font-size='58' font-weight='800' fill='%23f5b942' text-anchor='middle'%3EN%3C/text%3E%3C/svg%3E">
```

- [ ] **Step 2: Agregar meta tags de descripción y Open Graph**

En `public/index.html`, justo después de `<meta name="viewport" ...>`, agregar:

```html
    <meta name="description" content="Las noticias más relevantes de Argentina leídas, analizadas, categorizadas y resumidas por Inteligencia Artificial en tiempo real.">
    <meta property="og:title" content="Noticias IA — La información al instante">
    <meta property="og:description" content="Las noticias más relevantes de Argentina leídas, analizadas, categorizadas y resumidas por Inteligencia Artificial en tiempo real.">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="es_AR">
```

- [ ] **Step 3: Verificar**

Run: `npx serve public`, abrir en navegador, confirmar en la pestaña del navegador que aparece el ícono "N" en ámbar sobre fondo oscuro (puede requerir refrescar forzado / limpiar caché del favicon).

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: agrega favicon SVG y meta tags Open Graph"
```

---

## Task 10: Breakpoint mobile (480px) y verificación final completa

**Files:**
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: todas las clases y variables creadas en Tasks 2-9.

- [ ] **Step 1: Agregar el breakpoint de mobile chico**

En `public/styles.css`, después del media query existente `@media (max-width: 850px) { ... }`, agregar:

```css
        @media (max-width: 480px) {
            .container {
                padding: 0 1rem;
            }
            .hero h1 {
                font-size: 1.85rem;
            }
            .hero p {
                font-size: 1rem;
            }
            .hero-badges {
                gap: 0.5rem;
            }
            .hero-badge {
                font-size: 0.7rem;
                padding: 0.35rem 0.7rem;
            }
            .news-card {
                padding: 1.25rem;
            }
            .contact-form {
                padding: 1.5rem;
            }
            .social-btn {
                padding: 0.85rem 1.1rem;
            }
        }
```

- [ ] **Step 2: Verificar en viewport mobile**

Run: `npx serve public`, abrir devtools, simular viewport de 375px de ancho.
Expected: hero, badges, cards y formulario de contacto sin overflow horizontal ni elementos cortados.

- [ ] **Step 3: Correr la suite de tests de las funciones puras una vez más**

Run: `node --test public/app.test.js`
Expected: PASS — 7 tests, 0 failures (confirma que ningún cambio de las Tasks 2-9 tocó la lógica de `app.js`).

- [ ] **Step 4: Verificación manual final contra el checklist del spec**

Con `npx serve public` corriendo, revisar uno por uno (desktop y viewport de 480px):
- [ ] Header: logo con ícono ámbar, nav con 2 links funcionando (scroll a `#noticias` y `#contacto`).
- [ ] Hero: título sin gradiente, palabra "instante" en ámbar, glow de fondo visible, 3 badges con punto "en vivo" pulsante.
- [ ] Filtros: 9 botones con ícono, click cambia el estado activo a ámbar y filtra los skeletons/cards visibles (sin romper la lógica de `data-filter`).
- [ ] Cards: borde izquierdo coloreado por categoría (verificar manualmente seteando `data-category` desde devtools si no hay datos reales de Firestore en local), animación de entrada visible al cargar.
- [ ] Contacto: 4 badges de stack tecnológico, foco ámbar en inputs, botón submit ámbar con texto oscuro.
- [ ] Footer: tagline + link a GitHub funcionando.
- [ ] `404.html`: tema oscuro, botón ámbar.
- [ ] Favicon "N" ámbar visible en la pestaña del navegador.
- [ ] Sin errores en la consola del navegador.

- [ ] **Step 5: Commit final**

```bash
git add public/styles.css
git commit -m "feat: agrega breakpoint mobile de 480px"
```

---

## Self-Review (completado durante la redacción del plan)

- **Cobertura del spec:** cada sección del spec (header/nav, hero, filtros, cards, contacto, footer, 404, responsive, favicon/OG, arquitectura de archivos) tiene una task dedicada. La paleta ámbar y `--font-mono` se definen una sola vez en Task 2 y se consumen en el resto — sin duplicación de valores hardcodeados salvo en `404.html` (Task 8), que es un archivo standalone sin acceso a `styles.css` por diseño (es el fallback que sirve Firebase antes de cargar nada del sitio), así que ahí los hex van inline a propósito.
- **Sin placeholders:** todos los steps incluyen código completo, sin "TBD" ni "similar a la Task X".
- **Consistencia de tipos/nombres:** `formatTimeAgo` y `getCategoryClass` mantienen firma y nombre idénticos entre Task 1 (creación) y el test (consumo). `data-category` (sin prefijo `cat-`) es el atributo que `app.js` setea y que Task 5 consume en los selectores CSS — verificado que coincide (`catClass.replace('cat-', '')` en `app.js` vs. `[data-category="deportes"]` etc. en `styles.css`).
