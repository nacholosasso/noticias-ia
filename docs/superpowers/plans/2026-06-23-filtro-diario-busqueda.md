# Filtro por diario y barra de búsqueda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar al frontend estático (`public/`) un filtro por diario (generado dinámicamente desde los datos cargados) y una barra de búsqueda en tiempo real sobre título + resumen, combinables con el filtro de categoría existente.

**Architecture:** Todo el cambio vive en `public/index.html`, `public/app.js`, `public/styles.css` y `public/app.test.js`. Se extraen dos funciones puras nuevas (`normalizeText`, `getUniqueDiarios`) testeables con `node --test`, y se reemplaza el handler de click de categoría (autocontenido) por una función única `applyFilters()` que combina categoría + diario + búsqueda con lógica AND. No se toca `backend.py` ni el esquema de Firestore.

**Tech Stack:** HTML/CSS/JS vanilla (sin frameworks ni bundler), Font Awesome 6.4 (ya cargado por CDN), Firebase Hosting/Firestore SDK compat (sin cambios de API), Node.js `node:test` + `node:assert/strict` (built-in, ya usado en `public/app.test.js`).

## Global Constraints

- No agregar frameworks, bundlers ni dependencias npm — no existe `package.json` y no se crea uno; los tests corren con `node --test public/app.test.js` directo.
- No tocar `backend.py` ni los nombres de campos de Firestore (`Diario`, `Titulo`, `Resumen_IA`, `Resumen_Web`, `Categoria`, `Link`, `Fecha_Publicacion`).
- La búsqueda filtra únicamente sobre los artículos ya traídos por el `limit(30)` existente — no se agrega paginación ni una query nueva a Firestore.
- No se agrega debounce al input de búsqueda (≤30 cards, filtrar en cada tecla es trivial).
- No se persiste el filtro/búsqueda activa en la URL ni en `localStorage`.
- Estilos nuevos reutilizan las variables CSS de `:root` ya definidas en `public/styles.css` (`--accent-color`, `--surface-color`, `--border-color`, `--text-secondary`, etc.) — no se introducen colores hardcodeados nuevos.
- Categoría y diario son grupos de filtro independientes (cada uno con su propio "active"); deben combinarse entre sí y con la búsqueda en AND, no reemplazarse.
- Spec completo: `docs/superpowers/specs/2026-06-23-filtro-diario-busqueda-design.md`.

---

## Task 1: Funciones puras `normalizeText` y `getUniqueDiarios` + tests

**Files:**
- Modify: `public/app.js:24-31` (función `getCategoryClass`, al principio del archivo)
- Modify: `public/app.test.js:1-3` (línea de `require`)
- Test: `public/app.test.js`

**Interfaces:**
- Produces: `normalizeText(str: string|null|undefined): string` — minúsculas, sin tildes (NFD + strip de marcas diacríticas), `''` para valores vacíos.
- Produces: `getUniqueDiarios(articles: Array<{Diario?: string}>): Array<{value: string, label: string}>` — un elemento por cada valor distinto de `Diario` (normalizado para dedup, sin tocar mayúsculas/tildes del label), ordenado alfabéticamente por `label`, ignorando artículos sin `Diario`.
- Ambas se exportan junto a `formatTimeAgo` y `getCategoryClass` en el `module.exports` existente de `public/app.js`.

- [ ] **Step 1: Escribir los tests (fallan porque las funciones no existen todavía)**

Editar `public/app.test.js`: cambiar la línea 3 y agregar tests nuevos al final del archivo.

```js
const { formatTimeAgo, getCategoryClass, normalizeText, getUniqueDiarios } = require('./app.js');
```

Agregar al final de `public/app.test.js`:

```js
test('normalizeText quita tildes y pasa a minusculas', () => {
    assert.equal(normalizeText('Política'), 'politica');
    assert.equal(normalizeText('CLARÍN'), 'clarin');
});

test('normalizeText devuelve string vacio para valores vacios', () => {
    assert.equal(normalizeText(null), '');
    assert.equal(normalizeText(undefined), '');
    assert.equal(normalizeText(''), '');
});

test('getUniqueDiarios devuelve diarios unicos ordenados alfabeticamente por label', () => {
    const articles = [
        { Diario: 'Clarin' },
        { Diario: 'Ambito' },
        { Diario: 'Clarin' },
        { Diario: 'Ole' },
    ];
    assert.deepEqual(getUniqueDiarios(articles), [
        { value: 'ambito', label: 'Ambito' },
        { value: 'clarin', label: 'Clarin' },
        { value: 'ole', label: 'Ole' },
    ]);
});

test('getUniqueDiarios ignora articulos sin diario', () => {
    assert.deepEqual(getUniqueDiarios([{ Diario: '' }, { Diario: null }, {}]), []);
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `node --test public/app.test.js`
Expected: FAIL — `TypeError: normalizeText is not a function` (o `getUniqueDiarios is not a function`).

- [ ] **Step 3: Implementar `normalizeText` y `getUniqueDiarios`, refactorizar `getCategoryClass`**

En `public/app.js`, reemplazar la función `getCategoryClass` actual (líneas 24-31) por:

```js
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
```

Al final del archivo, en el bloque `module.exports`, agregar las dos funciones nuevas:

```js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatTimeAgo, getCategoryClass, normalizeText, getUniqueDiarios };
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `node --test public/app.test.js`
Expected: PASS — `ℹ tests 10`, `ℹ pass 10`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/app.test.js
git commit -m "feat: agrega normalizeText y getUniqueDiarios con tests"
```

---

## Task 2: Markup y estilos de la barra de búsqueda y el contenedor de filtro de diario

**Files:**
- Modify: `public/index.html:41-52`
- Modify: `public/styles.css` (agregar al final, antes de la sección `/* Responsive */`)

**Interfaces:**
- Produces: `#search-input` (input de texto, id usado por Task 4 para leer el término de búsqueda).
- Produces: `#category-filters` (id nuevo en el contenedor de filtros de categoría existente, usado por Task 4 para delegar el click).
- Produces: `#diario-filters` (contenedor vacío salvo el botón "Todos los diarios"; Task 3 le agrega botones dinámicamente, Task 4 delega el click).

- [ ] **Step 1: Editar `public/index.html`**

Reemplazar el bloque actual (líneas 41-52):

```html
        <!-- Filtros -->
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

por:

```html
        <!-- Búsqueda -->
        <div class="search-container">
            <i class="fa-solid fa-magnifying-glass search-icon"></i>
            <input type="text" id="search-input" class="search-input" placeholder="Buscar por palabra, nombre o lugar...">
        </div>

        <!-- Filtros de categoría -->
        <div class="filters-container" id="category-filters">
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

        <!-- Filtro por diario (se completa dinámicamente según las noticias cargadas) -->
        <div class="filters-container" id="diario-filters">
            <button class="filter-btn active" data-diario-filter="all"><i class="fa-solid fa-newspaper"></i> Todos los diarios</button>
        </div>
```

- [ ] **Step 2: Agregar estilos en `public/styles.css`**

Agregar antes del comentario `/* Responsive */` (línea 476 actual):

```css
/* Barra de búsqueda */
.search-container {
    position: relative;
    max-width: 500px;
    margin: 0 auto 2rem;
}

.search-input {
    width: 100%;
    padding: 0.75rem 1.2rem 0.75rem 2.8rem;
    background-color: var(--surface-color);
    border: 1px solid var(--border-color);
    border-radius: 30px;
    color: var(--text-primary);
    font-size: 0.95rem;
    transition: border-color 0.3s, box-shadow 0.3s;
}

.search-input::placeholder {
    color: var(--text-secondary);
}

.search-input:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(245, 185, 66, 0.25);
}

.search-icon {
    position: absolute;
    left: 1.1rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
    pointer-events: none;
}
```

- [ ] **Step 3: Verificación visual local**

Run: `npx serve public` (desde la raíz del proyecto) y abrir `http://localhost:3000` en el navegador.
Expected: se ve la barra de búsqueda con ícono de lupa arriba de los filtros de categoría, y debajo de esos filtros una segunda fila con un solo botón "Todos los diarios" activo. Sin Firestore real disponible en local, el grid de noticias muestra el mensaje "La configuración de Firebase Hosting no ha cargado correctamente." — eso es esperado y no bloquea este task (se valida con datos reales en el Task 5). Confirmar en la consola del navegador (F12) que no hay errores de JS.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/styles.css
git commit -m "feat: agrega markup y estilos de busqueda y filtro de diario"
```

---

## Task 3: Atributos de datos por card y render dinámico de pills de diario

**Files:**
- Modify: `public/app.js` (dentro de `initApp`, dentro del `.then((querySnapshot) => { ... })` actual)

**Interfaces:**
- Consumes: `normalizeText(str)`, `getUniqueDiarios(articles)` (Task 1); `#diario-filters` (Task 2).
- Produces: cada `.news-card` queda con `data-diario`, `data-diario-label` y `data-search` además del `data-category` ya existente; función nueva `renderDiarioFilters(articlesData)` que pinta los botones de diario, consumida por Task 4 (que la llama tras renderizar las cards) — en este task se llama directamente al final del `.then()`.

- [ ] **Step 1: Agregar la función `renderDiarioFilters` en `public/app.js`**

Agregar después de `getUniqueDiarios` (definida en Task 1) y antes de `formatTimeAgo`:

```js
function renderDiarioFilters(articlesData) {
    const diarioContainer = document.getElementById('diario-filters');
    getUniqueDiarios(articlesData).forEach(({ value, label }) => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.setAttribute('data-diario-filter', value);
        btn.innerHTML = `<i class="fa-solid fa-newspaper"></i> ${label}`;
        diarioContainer.appendChild(btn);
    });
}
```

- [ ] **Step 2: Setear los atributos nuevos en cada card y recolectar `articlesData`**

Dentro de `initApp`, en el callback `.then((querySnapshot) => { ... })`, reemplazar:

```js
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
```

por:

```js
                    const articlesData = [];

                    querySnapshot.forEach((doc) => {
                        const data = doc.data();
                        articlesData.push(data);

                        const articleEl = document.createElement('article');
                        articleEl.className = 'news-card';

                        const catClass = getCategoryClass(data.Categoria);
                        articleEl.setAttribute('data-category', catClass.replace('cat-', ''));
                        const titulo = data.Titulo || 'Sin título';
                        const resumen = data.Resumen_IA || data.Resumen_Web || 'Sin resumen disponible.';
                        const fuente = data.Diario || 'Fuente';
                        const link = data.Link || '#';
                        const categoriaTexto = data.Categoria || 'General';

                        articleEl.setAttribute('data-diario', normalizeText(data.Diario));
                        articleEl.setAttribute('data-diario-label', data.Diario || '');
                        articleEl.setAttribute('data-search', normalizeText(`${titulo} ${resumen}`));

                        articleEl.innerHTML = `
```

Y, justo después del `querySnapshot.forEach((doc) => { ... });` (que cierra con `newsContainer.appendChild(articleEl); });`), agregar la llamada:

```js
                    renderDiarioFilters(articlesData);
```

- [ ] **Step 3: Revisión manual del diff**

No hay test automatizado posible para esta lógica (depende de datos reales de Firestore + DOM; el proyecto no tiene `jsdom` ni mocks de Firestore, y `Global Constraints` prohíbe agregar dependencias npm nuevas). Revisar el diff a mano confirmando:
- `articlesData` se llena con el `data` crudo de cada doc, en el mismo orden que las cards.
- `renderDiarioFilters` se llama una sola vez, después de que el `forEach` terminó de crear todas las cards.
- `data-diario` usa `normalizeText`, `data-diario-label` usa el valor crudo de `data.Diario` (o `''`).

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat: agrega data-diario, data-diario-label, data-search y render de pills de diario"
```

---

## Task 4: Filtrado combinado (categoría + diario + búsqueda) y mensaje de "sin resultados" genérico

**Files:**
- Modify: `public/app.js` (función `initApp`, reemplaza el bloque de `filterBtns.forEach(...)` actual)

**Interfaces:**
- Consumes: `normalizeText` (Task 1); `#category-filters`, `#diario-filters`, `#search-input` (Task 2); `data-diario`, `data-search` en cada card (Task 3).
- Produces: `applyFilters()`, llamada por los tres listeners (categoría, diario, búsqueda) y una vez al terminar de renderizar las cards.

- [ ] **Step 1: Agregar `applyFilters` en `public/app.js`**

Agregar después de `renderDiarioFilters` (Task 3) y antes de `initApp`:

```js
function applyFilters() {
    const activeCategoryBtn = document.querySelector('#category-filters .filter-btn.active');
    const activeDiarioBtn = document.querySelector('#diario-filters .filter-btn.active');
    const activeCategoria = activeCategoryBtn ? activeCategoryBtn.getAttribute('data-filter') : 'all';
    const activeDiario = activeDiarioBtn ? activeDiarioBtn.getAttribute('data-diario-filter') : 'all';
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? normalizeText(searchInput.value.trim()) : '';

    const allCards = document.querySelectorAll('#news-container .news-card');
    let visibleCount = 0;

    allCards.forEach(card => {
        if (card.querySelector('.skeleton')) return;

        const matchCategoria = activeCategoria === 'all' || card.getAttribute('data-category') === activeCategoria;
        const matchDiario = activeDiario === 'all' || card.getAttribute('data-diario') === activeDiario;
        const matchBusqueda = searchTerm === '' || card.getAttribute('data-search').includes(searchTerm);
        const visible = matchCategoria && matchDiario && matchBusqueda;

        card.classList.toggle('hidden', !visible);
        if (visible) visibleCount++;
    });

    let emptyMsg = document.getElementById('empty-filter-msg');
    const hasRealCards = allCards.length > 0 && !allCards[0].querySelector('.skeleton');

    if (visibleCount === 0 && hasRealCards) {
        if (!emptyMsg) {
            emptyMsg = document.createElement('p');
            emptyMsg.id = 'empty-filter-msg';
            emptyMsg.style.cssText = 'grid-column: 1/-1; text-align:center; color: var(--text-secondary); padding: 2rem 0;';
            emptyMsg.textContent = 'No hay noticias que coincidan con los filtros seleccionados.';
            document.getElementById('news-container').appendChild(emptyMsg);
        } else {
            emptyMsg.style.display = 'block';
        }
    } else if (emptyMsg) {
        emptyMsg.style.display = 'none';
    }
}
```

- [ ] **Step 2: Reemplazar el bloque de listeners dentro de `initApp`**

Reemplazar:

```js
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
```

por:

```js
function initApp() {
    document.getElementById('category-filters').addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        document.querySelectorAll('#category-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
    });

    document.getElementById('diario-filters').addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        document.querySelectorAll('#diario-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
    });

    document.getElementById('search-input').addEventListener('input', applyFilters);

    setTimeout(() => {
```

- [ ] **Step 3: Llamar a `applyFilters()` al terminar de renderizar las cards**

Dentro del mismo `.then((querySnapshot) => { ... })` de Task 3, justo después de la línea `renderDiarioFilters(articlesData);`, agregar:

```js
                    applyFilters();
```

- [ ] **Step 4: Correr la suite de tests existente para confirmar que no se rompió nada**

Run: `node --test public/app.test.js`
Expected: PASS — los 10 tests de Task 1 siguen pasando (esta lógica de DOM no tiene tests propios, pero el cambio no debe afectar `normalizeText`, `getCategoryClass`, `getUniqueDiarios` ni `formatTimeAgo`).

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git commit -m "feat: combina filtro de categoria, diario y busqueda con logica AND"
```

---

## Task 5: Verificación manual end-to-end

**Files:** ninguno (solo verificación, sin cambios de código).

**Interfaces:** N/A.

- [ ] **Step 1: Verificación local sin datos reales**

Run: `npx serve public` y abrir en el navegador.
Expected: sin errores en la consola del navegador; la barra de búsqueda, los filtros de categoría y el botón "Todos los diarios" se ven y son clickeables (no hacen nada visible porque no hay cards reales, solo el mensaje de "configuración de Firebase Hosting no ha cargado correctamente").

- [ ] **Step 2: Pedir confirmación antes de publicar un canal de preview**

La única forma de probar con datos reales de Firestore es contra el sitio servido por Firebase Hosting (el script `/__/firebase/init.js` que arma la conexión a Firestore solo lo inyecta la infraestructura real de Hosting, no un servidor estático local). Antes de ejecutar el deploy del Step 3, **pedir confirmación explícita al usuario** — es una acción que publica contenido en una URL accesible públicamente, aunque sea temporal y no toque el sitio de producción.

- [ ] **Step 3: Deploy a canal de preview (solo tras confirmación del usuario)**

Run: `firebase hosting:channel:deploy filtro-diario-busqueda --expires 1d`
Expected: la salida muestra una URL de preview tipo `https://info-noticias-ia--filtro-diario-busqueda-<hash>.web.app`. El canal expira solo en 1 día, no requiere limpieza manual.

- [ ] **Step 4: Checklist funcional sobre la URL de preview**

Abrir la URL de preview y confirmar:
1. Aparecen pills de diario además de "Todos los diarios" — uno por cada `Diario` presente en las últimas 30 noticias (ver `FUENTES` en `backend.py`: Olé, Caras, Ambito, Clarin).
2. Combinar categoría + diario + búsqueda a la vez reduce la grilla correctamente (AND, no OR) — ej: elegir una categoría, después un diario, después escribir una palabra, y confirmar que solo quedan cards que cumplen las tres condiciones.
3. Buscar un nombre propio o lugar que aparezca en el resumen (no en el título) de alguna noticia la encuentra igual.
4. Limpiar el texto de búsqueda, o volver a "Todas"/"Todos los diarios", restaura las cards que esos filtros habían ocultado.
5. El mensaje "No hay noticias que coincidan con los filtros seleccionados." aparece cuando una combinación de filtros no deja ninguna card visible, y desaparece al aflojar cualquiera de los filtros.

- [ ] **Step 5: Reportar resultado**

Si los 5 puntos del Step 4 pasan, el feature está listo para mergear/deployar a producción (`firebase deploy --only hosting`) — ese deploy final también requiere confirmación explícita del usuario, igual que el de preview.
