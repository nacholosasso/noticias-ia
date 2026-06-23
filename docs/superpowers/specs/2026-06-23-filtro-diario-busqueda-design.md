# Filtro por diario y barra de búsqueda en el frontend

## Contexto

El frontend (`public/index.html` + `public/app.js` + `public/styles.css`) trae hasta 30 artículos de Firestore (`db.collection('articulos')`) y ya permite filtrar por categoría con una fila de botones (`.filter-btn`, `data-filter`) que muestran/ocultan `.news-card` según su atributo `data-category`. Cada artículo tiene, entre otros campos, `Diario` (la fuente: Olé, Caras, Ambito, Clarin — ver `FUENTES` en `backend.py`), `Titulo` y `Resumen_IA`/`Resumen_Web`.

Se quiere poder filtrar también por diario, y buscar libremente por palabra/nombre/lugar dentro de las noticias ya cargadas.

## Objetivo

Agregar, sin tocar `backend.py`:
1. Un filtro por diario, con la misma UX de pills que el filtro de categoría.
2. Una barra de búsqueda de texto libre que filtre en tiempo real sobre título + resumen.
3. Que ambos filtros se combinen entre sí y con el filtro de categoría existente (AND), no que se reemplacen unos a otros.

## Diseño

### 1. Normalización de texto compartida

Hoy `getCategoryClass` normaliza tildes/mayúsculas inline. Se extrae esa normalización a una función pura y reutilizable:

```js
function normalizeText(str) {
    if (!str) return '';
    return str.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
}
```

`getCategoryClass` pasa a usar `normalizeText(cat)` en vez de su normalización inline. Se exporta junto a `formatTimeAgo` y `getCategoryClass` en el `module.exports` existente, para poder testearla igual que las otras funciones puras.

### 2. Atributos nuevos en cada `news-card`

Al renderizar cada artículo (dentro del `querySnapshot.forEach` actual), además del `data-category` que ya se setea, se agregan:

- `data-diario="<normalizeText(data.Diario)>"` (ej: `"clarin"`, `"ole"`) — usado para el matching del filtro.
- `data-diario-label="<data.Diario sin normalizar>"` — el texto original (ej: `"Clarin"`), usado solo para mostrar el nombre en el pill correspondiente.
- `data-search="<normalizeText(titulo + ' ' + resumen)>"` — texto plano ya normalizado, precalculado una sola vez al renderizar, para no recalcular tildes/mayúsculas en cada tecla que el usuario escriba.

Si `data.Diario` no existe, `data-diario` y `data-diario-label` quedan en `""` (esa card no matchea ningún pill de diario excepto "Todos").

### 3. Filtro de diario — generado dinámicamente

Debajo de `.filters-container` (categorías) se agrega un segundo contenedor en el HTML, inicialmente vacío:

```html
<div class="filters-container diario-filters-container" id="diario-filters">
    <button class="filter-btn active" data-diario-filter="all"><i class="fa-solid fa-newspaper"></i> Todos los diarios</button>
</div>
```

Después de pintar las cards (en el mismo `.then()` del `querySnapshot`), se recolectan los pares únicos `(data-diario, data-diario-label)` presentes (no vacíos) entre las cards recién creadas — usando un `Map` con la clave normalizada para evitar duplicados — se ordenan alfabéticamente por label, y por cada uno se agrega un botón al `#diario-filters` con `data-diario-label` como texto visible y `data-diario` como valor de `data-diario-filter`. El botón "Todos los diarios" ya viene fijo en el HTML y siempre está presente.

Si no hay ningún `Diario` definido en los artículos cargados, el contenedor queda solo con el botón "Todos los diarios" (no rompe nada, simplemente no aporta filtro).

### 4. Barra de búsqueda

Arriba de los filtros de categoría (entre el `hero` y `.filters-container`), se agrega:

```html
<div class="search-container">
    <i class="fa-solid fa-magnifying-glass search-icon"></i>
    <input type="text" id="search-input" class="search-input" placeholder="Buscar por palabra, nombre o lugar...">
</div>
```

Estilo: input ancho (max-width ~500px, centrado), fondo `--surface-color`, borde `--border-color`, ícono de lupa posicionado absoluto a la izquierda — mismo lenguaje visual que `.form-control` del formulario de contacto pero en formato pill, consistente con `.filter-btn`.

### 5. Filtrado combinado

Se reemplaza el listener de click de categoría (hoy autocontenido) por tres listeners livianos que comparten una sola función:

- Click en un `.filter-btn[data-filter]` → guarda la categoría activa, marca `.active` en ese grupo, llama a `applyFilters()`.
- Click en un `.filter-btn[data-diario-filter]` (delegado sobre `#diario-filters`, porque sus botones se crean dinámicamente) → guarda el diario activo, marca `.active` en ese grupo, llama a `applyFilters()`.
- Evento `input` en `#search-input` → guarda `normalizeText(valor)` como término de búsqueda, llama a `applyFilters()`.

`applyFilters()` recorre las `.news-card` (saltando las que tengan `.skeleton`, igual que hoy) y muestra una card solo si cumple las tres condiciones a la vez:

```js
const matchCategoria = activeCategoria === 'all' || card.dataset.category === activeCategoria;
const matchDiario = activeDiario === 'all' || card.dataset.diario === activeDiario;
const matchBusqueda = searchTerm === '' || card.dataset.search.includes(searchTerm);
card.classList.toggle('hidden', !(matchCategoria && matchDiario && matchBusqueda));
```

El mensaje de "no hay resultados" (`#empty-filter-msg`) se generaliza: se sigue mostrando/ocultando igual que hoy según `visibleCount === 0`, pero el texto pasa a ser genérico ("No hay noticias que coincidan con los filtros seleccionados.") en vez de mencionar solo categoría.

### 6. Orden de inicialización

Como los pills de diario y los `data-search`/`data-diario` de cada card dependen de los datos de Firestore, `applyFilters()` y el render de pills de diario solo pueden ejecutarse **después** de que el `querySnapshot.forEach` terminó de crear las cards. Los listeners de categoría y búsqueda se pueden registrar antes (no dependen de datos), simplemente no tendrán nada que filtrar hasta que la promesa resuelva.

### 7. Fuera de alcance

- No se pagina ni se buscan artículos fuera de los 30 ya traídos por el `limit(30)` existente — la búsqueda es client-side sobre lo ya cargado, no una query nueva a Firestore.
- No se agrega debounce a la búsqueda: con ≤30 cards filtrar en cada tecla es trivial en costo y no se nota lag.
- No se persiste el filtro/búsqueda activa en la URL ni en localStorage.

## Testing

Se agregan tests a `public/app.test.js` (mismo patrón `node:test` que los existentes) para `normalizeText`:

- Quita tildes y pasa a minúsculas (ej: `"Política"` → `"politica"`).
- Devuelve `''` para `null`/`undefined`/string vacío.

La lógica de DOM (render de pills dinámicos, listeners, `applyFilters`) no se cubre con `node:test` por falta de entorno DOM en el proyecto — igual que el filtrado de categoría existente hoy. Se valida manualmente en navegador:

1. Cargan los 4 diarios como pills además de "Todos los diarios".
2. Combinar categoría + diario + búsqueda a la vez reduce correctamente la grilla (AND, no OR).
3. Buscar un nombre/lugar que aparece en el resumen de una noticia la encuentra aunque no esté en el título.
4. Limpiar la búsqueda o volver a "Todos"/"Todas" restaura las cards ocultas por ese filtro.
5. Mensaje de "sin resultados" aparece y desaparece correctamente al combinar filtros.
