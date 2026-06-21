# Manejo de cuota gratuita de Gemini — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evitar que `backend.py` desperdicie cuota gratuita de Gemini reintentando modelos ya agotados, y evitar que noticias bloqueadas solo por falta de cupo queden guardadas para siempre con un resumen roto.

**Architecture:** Todo el cambio vive en `backend.py` (proyecto de un solo script). Se agrega una función pura `es_error_de_cuota` para clasificar excepciones, una función `elegir_resumen_ia` que encapsula la cascada de modelos (hoy inline dentro de `ejecutar_recoleccion`) para que sea testeable sin pegarle a la API real ni a Firestore, y se modifica `ejecutar_recoleccion` para usar una lista negra de modelos por diario/corrida, saltear el guardado cuando el único motivo de fallo es cuota, y pacear el sleep según el RPM real del modelo que respondió.

**Tech Stack:** Python 3, `google-genai` SDK (ya instalado en `.venv`), sin frameworks de testing nuevos (el proyecto no tiene pytest; verificación manual con `.venv/Scripts/python.exe -c "..."` y una corrida real de `backend.py`).

## Global Constraints

- No se agrega ninguna dependencia nueva a `requirements.txt`.
- No se agrega persistencia de cuota en Firestore (decisión explícita del spec — la cuota gratuita ya alcanza para el volumen actual, y los rechazos 429 no cuestan nada).
- No se cambia el orden ni la lista de `modelos_a_probar`.
- No se introduce pytest ni ninguna carpeta `tests/` — el proyecto no la tiene y el spec decidió no agregarla.
- Spec de referencia: `docs/superpowers/specs/2026-06-21-gemini-quota-management-design.md`.

---

### Task 1: Clasificación de errores de cuota + tabla de RPM por modelo

**Files:**
- Modify: `backend.py:1-14` (imports)
- Modify: `backend.py:28-32` (config, agregar constante después de `FUENTES`)
- Modify: `backend.py:64-74` (agregar función después de `extraer_cuerpo_noticia`)

**Interfaces:**
- Produces: `es_error_de_cuota(e: Exception) -> bool`, `RPM_POR_MODELO: dict[str, int]` — usados por la Task 2.

- [ ] **Step 1: Agregar los imports nuevos**

En `backend.py`, la línea 8 actual es:

```python
import time  # Para el retraso (RPM)
```

Reemplazarla por:

```python
import time  # Para el retraso (RPM)
import math
from google.genai import errors as genai_errors
```

- [ ] **Step 2: Agregar la tabla de RPM por modelo**

Después del bloque `FUENTES` (líneas 28-32):

```python
FUENTES = {
    "Olé": "https://www.ole.com.ar/rss/ultimas-noticias/",
    "Caras": "https://caras.perfil.com/feed",
    "Ambito": "https://www.ambito.com/rss/pages/home.xml",
}
```

Agregar justo debajo:

```python
# RPM de la capa gratuita por modelo (tier free de AI Studio, ver spec).
# Se usa para pacear el sleep entre noticias según el modelo que respondió.
RPM_POR_MODELO = {
    'gemini-3.1-flash-lite-preview': 15,
    'gemini-3.5-flash': 5,
    'gemini-3-flash-preview': 5,
    'gemini-2.5-flash-lite': 10,
    'gemini-2.5-flash': 5,
}
```

- [ ] **Step 3: Agregar la función `es_error_de_cuota`**

Después de `extraer_cuerpo_noticia` (después de la línea 74, antes del comentario `# BUCLE PRINCIPAL`):

```python
def es_error_de_cuota(e: Exception) -> bool:
    """True si la excepción es un 429 (RPM/RPD/TPM agotado) del SDK de Gemini."""
    return isinstance(e, genai_errors.ClientError) and e.code == 429
```

- [ ] **Step 4: Verificar manualmente que la clasificación funciona**

Run:

```bash
.venv/Scripts/python.exe -c "
from backend import es_error_de_cuota, RPM_POR_MODELO
from google.genai import errors

cuota = errors.ClientError(429, {'error': {'message': 'quota', 'status': 'RESOURCE_EXHAUSTED'}})
print('cuota ->', es_error_de_cuota(cuota))
print('valueerror ->', es_error_de_cuota(ValueError('json roto')))
print('rpm principal ->', RPM_POR_MODELO['gemini-3.1-flash-lite-preview'])
"
```

Expected (en este orden):
```
cuota -> True
valueerror -> False
rpm principal -> 15
```

- [ ] **Step 5: Commit**

```bash
git add backend.py
git commit -m "feat: clasifica errores de cuota de Gemini y tabla de RPM por modelo"
```

---

### Task 2: Extraer la cascada de modelos a `elegir_resumen_ia` y conectarla

**Files:**
- Modify: `backend.py:118-126` (después de instanciar `client`, agregar la lista negra)
- Modify: `backend.py:148-194` (bloque de `resumen_ia`/`categoria_ia` + `for nombre_modelo in modelos_a_probar`)

**Interfaces:**
- Consumes: `es_error_de_cuota(e)`, `time.sleep`, `json.loads` (de Task 1 y librerías existentes).
- Produces: `elegir_resumen_ia(client, prompt, config_respuesta, modelos_a_probar, modelos_agotados, diario) -> tuple[str, str, bool, str | None, bool]` — `(resumen_ia, categoria_ia, exito, modelo_usado, hubo_error_no_cuota)`. Usada por la Task 3.

Esta task deja el script en estado funcional al final (sin `NameError`): la lista negra se crea y se conecta en el mismo paso en que se usa.

El bloque actual (dentro de `for entrada in feed.entries:`, líneas 147-194) es:

```python
                # GEMINI (Modelos TAL CUAL pediste)
                resumen_ia = "Error en IA"
                categoria_ia = "General"
                modelos_a_probar = [
                    'gemini-3.1-flash-lite-preview',
                    'gemini-3.5-flash',
                    'gemini-3-flash-preview',
                    'gemini-2.5-flash-lite',
                    'gemini-2.5-flash'
                ]

                prompt = f"Sos un periodista experto. Resumí la siguiente noticia en un párrafo de entre 40 y 60 palabras y clasificala en una categoría. REGLA ESTRICTA: básate ÚNICA Y EXCLUSIVAMENTE en el texto proporcionado. NO agregues información externa, no inventes datos y NO asumas nombres de personas (como entrenadores, funcionarios o jugadores) que no estén explícitamente escritos en el texto.\n\nNoticia:\n{texto_para_ia}"

                config_respuesta = {
                    'response_mime_type': 'application/json',
                    'response_schema': {
                        'type': 'OBJECT',
                        'properties': {
                            'resumen': {'type': 'STRING'},
                            'categoria': {
                                'type': 'STRING',
                                'format': 'enum',
                                'enum': ['Deportes', 'Política', 'Economía', 'Espectáculos', 'Tecnología', 'Salud', 'Sociedad'],
                            },
                        },
                        'required': ['resumen', 'categoria'],
                    },
                }

                for nombre_modelo in modelos_a_probar:
                    try:
                        print(f"🤖 Intentando con: {nombre_modelo} para {diario}...")
                        response = client.models.generate_content(
                            model=nombre_modelo,
                            contents=prompt,
                            config=config_respuesta
                        )
                        datos_ia = json.loads(response.text)
                        resumen_ia = datos_ia['resumen'].strip()
                        categoria_ia = datos_ia['categoria']

                        print(f"🤖 [{diario}] OK con: {nombre_modelo}")
                        break
                    except Exception as e:
                        print(f"❌ Error en {diario} con {nombre_modelo}: {e}")
                        # Esperamos 10 segundos antes de intentar con otro modelo para no saturar el RPM
                        time.sleep(10)
                        continue
```

- [ ] **Step 1: Agregar la función `elegir_resumen_ia` a nivel de módulo**

Agregarla después de `es_error_de_cuota` (Task 1, Step 3), antes de `# BUCLE PRINCIPAL`:

```python
def elegir_resumen_ia(client, prompt, config_respuesta, modelos_a_probar, modelos_agotados, diario):
    """Prueba los modelos en orden, salteando los que ya están en `modelos_agotados`
    (mutado in-place: agrega ahí cualquier modelo que devuelva 429 en este intento).
    Devuelve (resumen_ia, categoria_ia, exito, modelo_usado, hubo_error_no_cuota)."""
    resumen_ia = "Error en IA"
    categoria_ia = "General"
    exito = False
    hubo_error_no_cuota = False
    modelo_usado = None

    for nombre_modelo in modelos_a_probar:
        if nombre_modelo in modelos_agotados:
            continue

        try:
            print(f"🤖 Intentando con: {nombre_modelo} para {diario}...")
            response = client.models.generate_content(
                model=nombre_modelo,
                contents=prompt,
                config=config_respuesta
            )
            datos_ia = json.loads(response.text)
            resumen_ia = datos_ia['resumen'].strip()
            categoria_ia = datos_ia['categoria']
            modelo_usado = nombre_modelo
            exito = True

            print(f"🤖 [{diario}] OK con: {nombre_modelo}")
            break
        except Exception as e:
            if es_error_de_cuota(e):
                print(f"🚫 {nombre_modelo} sin cupo (cuota agotada) para {diario}, se descarta por el resto de esta corrida.")
                modelos_agotados.add(nombre_modelo)
            else:
                print(f"❌ Error en {diario} con {nombre_modelo}: {e}")
                hubo_error_no_cuota = True
                time.sleep(3)
            continue

    return resumen_ia, categoria_ia, exito, modelo_usado, hubo_error_no_cuota
```

- [ ] **Step 2: Verificar manualmente con un cliente falso (sin pegarle a la API real)**

Run:

```bash
.venv/Scripts/python.exe -c "
from backend import elegir_resumen_ia
from google.genai import errors

class RespuestaFalsa:
    def __init__(self, texto):
        self.text = texto

class ClientFalso:
    def __init__(self, secuencia):
        self.secuencia = secuencia
        self.llamadas = []
        class Models:
            def generate_content(_self, model, contents, config):
                self.llamadas.append(model)
                resultado = self.secuencia.pop(0)
                if isinstance(resultado, Exception):
                    raise resultado
                return RespuestaFalsa(resultado)
        self.models = Models()

modelos = ['gemini-3.1-flash-lite-preview', 'gemini-3.5-flash', 'gemini-2.5-flash']

# Caso 1: el primer modelo se queda sin cupo, el segundo responde bien.
agotados = set()
client = ClientFalso([errors.ClientError(429, {'error': {'status': 'RESOURCE_EXHAUSTED'}}), '{\"resumen\": \"r\", \"categoria\": \"Sociedad\"}'])
r = elegir_resumen_ia(client, 'prompt', {}, modelos, agotados, 'TestDiario')
print('caso1 ->', r[2], r[3], agotados)

# Caso 2: todos los modelos disponibles ya estaban agotados de antes.
agotados2 = {'gemini-3.1-flash-lite-preview', 'gemini-3.5-flash', 'gemini-2.5-flash'}
client2 = ClientFalso([])
r2 = elegir_resumen_ia(client2, 'prompt', {}, modelos, agotados2, 'TestDiario')
print('caso2 ->', r2[2], r2[4], client2.llamadas)
"
```

Expected:
```
caso1 -> True gemini-3.5-flash {'gemini-3.1-flash-lite-preview'}
caso2 -> False False []
```

(Caso 2 confirma que si todos los modelos ya están en la lista negra, no se hace ninguna llamada nueva — `client2.llamadas` queda vacío — y `hubo_error_no_cuota` es `False` porque nunca hubo un error real, solo modelos ya descartados.)

- [ ] **Step 3: Crear la lista negra por diario**

El bloque actual (líneas 118-126 originales) es:

```python
            # Instanciar el cliente una sola vez por diario
            api_key = API_KEYS.get(diario)
            if not api_key:
                print(f"⚠️ Sin API Key para {diario}, saltando...")
                continue
            client = genai.Client(api_key=api_key)
            
            # RECORREMOS TODAS LAS NOTICIAS DEL RSS
            for entrada in feed.entries:
```

Reemplazarlo por:

```python
            # Instanciar el cliente una sola vez por diario
            api_key = API_KEYS.get(diario)
            if not api_key:
                print(f"⚠️ Sin API Key para {diario}, saltando...")
                continue
            client = genai.Client(api_key=api_key)

            # Lista negra de modelos sin cupo para ESTA corrida de este diario.
            # No se persiste: si la cuota diaria sigue agotada en la próxima
            # corrida, el primer intento vuelve a fallar una vez (gratis) y
            # repuebla esta lista.
            modelos_agotados = set()

            # RECORREMOS TODAS LAS NOTICIAS DEL RSS
            for entrada in feed.entries:
```

- [ ] **Step 4: Reemplazar el bloque inline por la llamada a la función**

Reemplazar el bloque completo citado arriba (líneas 147-194 originales) por:

```python
                # GEMINI (Modelos TAL CUAL pediste)
                modelos_a_probar = [
                    'gemini-3.1-flash-lite-preview',
                    'gemini-3.5-flash',
                    'gemini-3-flash-preview',
                    'gemini-2.5-flash-lite',
                    'gemini-2.5-flash'
                ]

                prompt = f"Sos un periodista experto. Resumí la siguiente noticia en un párrafo de entre 40 y 60 palabras y clasificala en una categoría. REGLA ESTRICTA: básate ÚNICA Y EXCLUSIVAMENTE en el texto proporcionado. NO agregues información externa, no inventes datos y NO asumas nombres de personas (como entrenadores, funcionarios o jugadores) que no estén explícitamente escritos en el texto.\n\nNoticia:\n{texto_para_ia}"

                config_respuesta = {
                    'response_mime_type': 'application/json',
                    'response_schema': {
                        'type': 'OBJECT',
                        'properties': {
                            'resumen': {'type': 'STRING'},
                            'categoria': {
                                'type': 'STRING',
                                'format': 'enum',
                                'enum': ['Deportes', 'Política', 'Economía', 'Espectáculos', 'Tecnología', 'Salud', 'Sociedad'],
                            },
                        },
                        'required': ['resumen', 'categoria'],
                    },
                }

                resumen_ia, categoria_ia, exito, modelo_usado, hubo_error_no_cuota = elegir_resumen_ia(
                    client, prompt, config_respuesta, modelos_a_probar, modelos_agotados, diario
                )
```

- [ ] **Step 5: Verificar que el archivo compila e importa sin errores**

Run:

```bash
.venv/Scripts/python.exe -c "import backend; print('import ok')"
```

Expected:
```
import ok
```

- [ ] **Step 6: Commit**

```bash
git add backend.py
git commit -m "refactor: extrae la cascada de modelos de Gemini a elegir_resumen_ia y la conecta con lista negra por diario"
```

---

### Task 3: Guardado condicional y pacing dinámico del sleep

**Files:**
- Modify: `backend.py:196-215` (bloque de guardado + sleep, líneas originales — ya desplazadas por la Task 2)

**Interfaces:**
- Consumes: `exito`, `hubo_error_no_cuota`, `modelo_usado` (devueltos por `elegir_resumen_ia`, Task 2) y `RPM_POR_MODELO` (Task 1).

- [ ] **Step 1: Saltear el guardado cuando el único motivo de fallo es cuota, y pacear el sleep**

El bloque actual (líneas 196-215 originales, después del cambio de la Task 2 sigue siendo el mismo contenido, solo se movió más arriba en el archivo):

```python
                # Preparar y guardar
                datos = {
                    "Diario": diario, 
                    "Fecha_Carga": fecha_carga,
                    "Fecha_Publicacion": fecha_publicacion,
                    "Categoria": categoria_ia,
                    "Titulo": entrada.title,
                    "Resumen_IA": resumen_ia,
                    "Resumen_Web": resumen_rss,
                    "Link": link_actual
                }

                if guardar_en_firestore(datos, db):
                    print(f"💾 Guardado en Firestore.")
                    enlaces_existentes.add(link_actual) # Agregamos a memoria para evitar duplicados
                
                # --- CONTROL DE RPM ---
                # Límite gratuito de Gemini Flash: 15 RPM (1 peticion cada 4 segs).
                print("⏳ Esperando 5s para cuidar el RPM...")
                time.sleep(5)
```

Reemplazarlo por:

```python
                # Si ningún modelo respondió y el único motivo fue falta de cupo
                # (no un error real), no se guarda: se reintenta en la próxima corrida.
                if not exito and not hubo_error_no_cuota:
                    print(f"⏭️ Sin cupo en ningún modelo para '{entrada.title[:40]}...', se reintentará en la próxima corrida.")
                    continue

                # Preparar y guardar
                datos = {
                    "Diario": diario, 
                    "Fecha_Carga": fecha_carga,
                    "Fecha_Publicacion": fecha_publicacion,
                    "Categoria": categoria_ia,
                    "Titulo": entrada.title,
                    "Resumen_IA": resumen_ia,
                    "Resumen_Web": resumen_rss,
                    "Link": link_actual
                }

                if guardar_en_firestore(datos, db):
                    print(f"💾 Guardado en Firestore.")
                    enlaces_existentes.add(link_actual) # Agregamos a memoria para evitar duplicados

                # --- CONTROL DE RPM ---
                # Ritmo según el modelo que realmente respondió; 5s por defecto
                # si se guardó con placeholder sin éxito de ningún modelo.
                espera = math.ceil(60 / RPM_POR_MODELO[modelo_usado]) + 1 if exito else 5
                print(f"⏳ Esperando {espera}s para cuidar el RPM...")
                time.sleep(espera)
```

- [ ] **Step 2: Verificación manual end-to-end con una corrida real**

Run (requiere `firebase-creds.json` y al menos una API key real en `.env`, igual que cualquier corrida normal del proyecto):

```bash
.venv/Scripts/python.exe backend.py
```

Revisar en la salida de la consola:
- Que aparezcan líneas `🤖 Intentando con: ...` y, si el RPD del modelo principal ya está usado, `🚫 ... sin cupo (cuota agotada) ...` seguido de un intento con el siguiente modelo, **sin** la espera de 10s que tenía antes.
- Que el tiempo de espera entre noticias (`⏳ Esperando Xs...`) sea ~5s cuando responde el modelo principal, y mayor (hasta ~13s) si respondió un modelo de respaldo.
- Si en algún momento todos los modelos quedan agotados para una noticia, que se imprima `⏭️ Sin cupo en ningún modelo...` y que esa noticia **no** aparezca en los logs de `💾 Guardado en Firestore.` (confirmar también que su link no quedó en la colección `articulos` de Firestore).

- [ ] **Step 3: Commit**

```bash
git add backend.py
git commit -m "feat: difiere el guardado de noticias sin cupo de IA y pacea el sleep por modelo"
```

---

## Recordatorio fuera de código

Después de implementar, confirmar manualmente en aistudio.google.com/apikey que los 3 proyectos (Olé, Caras, Ámbito) siguen en el tier gratuito sin cuenta de facturación vinculada — es lo único que garantiza de verdad "nunca pagar"; este plan optimiza el uso de la cuota gratis, pero no puede controlar la configuración de billing de los proyectos.
