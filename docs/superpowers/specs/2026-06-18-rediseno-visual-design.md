# Rediseño visual de Noticias IA — Design Spec

**Fecha:** 2026-06-18
**Estado:** Aprobado por el usuario

## Contexto

`public/index.html` es la única página del sitio: un agregador de noticias argentinas (Olé, Caras, Ámbito) procesadas por Gemini AI, servido desde Firebase Hosting. La página cumple doble función: producto de lectura de noticias y portfolio personal (tiene una sección de contacto "¿Tenés una idea o proyecto?" dirigida a potenciales clientes/reclutadores).

El diseño actual ya tiene una base sólida (tema oscuro slate, cards con hover, filtros por categoría, skeleton loaders, formulario funcional vía Formspree), pero usa un gradiente azul→violeta→rosa en el `<h1>` y celeste como acento — una estética muy genérica de "sitio de IA 2024" que no se distingue de cientos de plantillas similares.

## Objetivo

Elevar el aspecto visual a un nivel "super profesional" sin cambiar la arquitectura (sigue siendo un sitio 100% estático, sin build step, deployado vía `firebase deploy --only hosting`). El rediseño debe balancear las dos funciones del sitio: producto de noticias real + showcase de las habilidades técnicas del autor, sin que ninguna de las dos domine.

## Decisiones de diseño (aprobadas)

### Dirección estética
**AI/Tech SaaS premium** — evoluciona la identidad actual (oscuro, Inter, glassmorphism) en vez de reinventarla. Referencia de calidad: Linear/Vercel/Anthropic.

### Prioridad de contenido
**Balance entre noticias y portfolio.** El hero y las cards se sienten como un producto real; se agregan toques puntuales (badges de stack tecnológico, indicador "en vivo") que comunican el trabajo de automatización/IA detrás, sin invadir el contenido informativo.

### Paleta de color
- Se reemplaza el acento celeste + gradiente de 3 colores por un **acento ámbar/dorado distintivo** (`~#f5b942`), usado en CTAs, estado activo de filtros, focus rings, ícono del logo y highlight del hero.
- El fondo se mantiene oscuro pero más rico: `~#0a0e16` con un glow radial sutil detrás del hero (en vez de plano).
- Los 8 colores de categoría (deportes, política, economía, espectáculos, tecnología, salud, sociedad, general) **se mantienen sin cambios** — son funcionales (badges), no de marca, y ya cubren la mayoría del espectro de color.
- El `<h1>` del hero pasa de gradiente de 3 colores a texto blanco sólido con una palabra clave en ámbar.

### Tipografía
- Se mantiene Inter como tipografía principal.
- Se agrega una tipografía monoespaciada (JetBrains Mono o similar, vía Google Fonts) para metadatos técnicos: timestamps, badges de "en vivo", stack tecnológico — refuerza la sensación de producto técnico real.

### Arquitectura de archivos
El HTML monolítico actual (732 líneas, CSS y JS inline) se separa en:
- `public/index.html` — estructura y contenido
- `public/styles.css` — todos los estilos
- `public/app.js` — toda la lógica (fetch de Firestore, filtros, formato de fecha)

Esto no cambia el proceso de deploy (sigue siendo Firebase Hosting estático), solo mejora la mantenibilidad.

## Diseño por sección

### Header / Nav
- Mismo layout sticky con `backdrop-filter: blur`, recolocado sobre la nueva paleta (fondo más oscuro y nítido).
- Ícono del logo (robot de Font Awesome) en ámbar en vez de azul.
- Se mantienen los 2 links existentes (Noticias, Contacto) — sin menú hamburguesa, no hace falta con tan poca navegación.

### Hero
- `<h1>` sin gradiente de 3 colores: blanco sólido + una palabra clave en ámbar.
- Fondo del hero con glow radial sutil en ámbar/slate (no plano).
- Nueva fila de "credibility badges" en tipografía mono, debajo del subtítulo: ej. `● En vivo` (punto pulsante animado vía CSS) · `Actualizado cada hora` · `Gemini AI`.

### Filtros de categoría
- Mismo comportamiento de filtrado (JS sin cambios funcionales).
- Estado activo (`.filter-btn.active`) usa el acento ámbar en vez de azul.
- Se agrega un ícono pequeño de Font Awesome por categoría para mejorar el escaneo visual.

### Cards de noticias
- Mismo grid `auto-fill minmax(340px, 1fr)`.
- Se agrega un borde-acento izquierdo de 3px con el color de la categoría de cada card (mejora el escaneo visual de la grilla).
- Hover: leve scale + shadow usando el color de la categoría de esa card (en vez de siempre azul/ámbar genérico).
- Animación fade-in/slide-up sutil al insertar las cards vía JS (hoy aparecen de golpe con `innerHTML`).
- Skeleton loader ajustado a los nuevos colores de fondo.

### Contacto
- Se mantiene la estructura de 2 columnas (info + formulario) y la integración con Formspree sin cambios.
- Se agrega una fila de badges de stack tecnológico (Python · Gemini AI · Firebase · Cloud Run) debajo del texto de contacto.
- Formulario: focus ring y botón submit en ámbar.

### Footer
- Línea de copyright actual + texto "Hecho con Python + Gemini AI" + link a GitHub del proyecto (`https://github.com/nacholosasso/noticias-ia`).

### 404.html
- Se reemplaza el template default de Firebase (fondo blanco, naranja Material) por una versión que matchee la paleta oscura + ámbar del sitio.

### Responsive
- Se agrega un breakpoint para mobile chico (`max-width: 480px`) además del existente (850px): ajusta padding del hero, tamaño de badges y el formulario de contacto para pantallas angostas.

### Otros detalles
- Favicon nuevo: SVG inline (sin archivos binarios), ícono simple en ámbar sobre fondo oscuro.
- Meta tags Open Graph (`og:title`, `og:description`, `og:image` si aplica) para previews prolijas al compartir el link.

## Fuera de alcance

- No se introduce ningún framework ni build step (sigue siendo HTML/CSS/JS estático).
- No se cambia la lógica de negocio: fetch de Firestore, formato de fecha, clasificación de categorías, integración con Formspree quedan funcionalmente idénticos.
- No se rediseña el backend (`backend.py`) ni el pipeline de scraping/IA.
- No se agrega modo claro/oscuro conmutable — el sitio sigue siendo exclusivamente oscuro.
- No se agrega menú hamburguesa móvil (la navegación actual de 2 links no lo requiere).

## Verificación

Es un cambio puramente visual/frontend sin lógica de servidor nueva. Verificación:
1. Levantar el sitio con un servidor estático local (ej. `npx serve public`) y revisar visualmente en viewport desktop y mobile (incluyendo el breakpoint de 480px).
2. Confirmar que el fetch de noticias desde Firestore sigue funcionando (requiere las credenciales de Firebase Hosting, que solo están disponibles en el entorno deployado — si no se puede probar contra datos reales en local, verificar al menos que el flujo de skeleton → render de cards funciona con datos de prueba).
3. Revisar que los filtros de categoría sigan funcionando con las nuevas clases/iconos.
4. Revisar el formulario de contacto (estructura/atributos intactos, Formspree sin cambios).
5. Revisar `404.html` standalone.
