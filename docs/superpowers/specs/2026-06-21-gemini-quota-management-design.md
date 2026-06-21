# Manejo de cuota gratuita de Gemini en backend.py

## Contexto

`backend.py` recolecta noticias por RSS de tres diarios (Olé, Caras, Ámbito), scrapea el cuerpo y le pide a Gemini un resumen + categoría con salida estructurada. Cada diario tiene su propia API key, y cada API key vive en un proyecto de Google Cloud / AI Studio **distinto**, por lo que cada diario tiene su propia cuota gratuita independiente.

Límites de la capa gratuita por proyecto (confirmados por el usuario en la consola de AI Studio):

| Modelo | RPM | TPM | RPD |
|---|---|---|---|
| gemini-3.1-flash-lite-preview | 15 | 250K | 500 |
| gemini-3.5-flash | 5 | 250K | 20 |
| gemini-3-flash-preview | 5 | 250K | 20 |
| gemini-2.5-flash-lite | 10 | 250K | 20 |
| gemini-2.5-flash | 5 | 250K | 20 |

El volumen típico es de 10 a 30 noticias nuevas por corrida y por diario, con corridas cada 2 horas (12 por día) — hasta ~360 noticias/día por diario en el peor caso, cifra que ya se acerca al techo de 500 RPD del modelo principal.

### Problemas del comportamiento actual

1. `modelos_a_probar` se recorre en cascada en cada noticia sin memoria de fallos anteriores: si el modelo principal se queda sin cupo diario (RPD), el código lo vuelve a intentar — y vuelve a fallar — en **cada noticia siguiente** de la misma corrida, gastando además un `sleep(10)` por intento fallido.
2. Esa cascada de fallos termina cayendo en los modelos de respaldo, que tienen apenas 20 RPD cada uno — se agotan casi de inmediato y dejan de ser útiles para el resto del día.
3. El `sleep(5)` fijo entre noticias está calibrado para el RPM del modelo principal (15 RPM); si la cascada cae a un modelo de respaldo (5-10 RPM), ese ritmo es demasiado rápido y provoca más 429 de los necesarios.
4. Cuando los 5 modelos fallan, la noticia se guarda igual con `Resumen_IA="Error en IA"` y `Categoria="General"`, y su link queda marcado como procesado para siempre — aunque el fallo haya sido por cuota agotada (es decir, mañana sí se podría haber resuelto bien).

## Objetivo

Procesar tantas noticias como permita la cuota gratuita de cada día, sin gastar cupo en reintentos inútiles, y sin pagar nunca — usando únicamente lo que ya devuelve la propia API (los rechazos 429 no tienen costo en la capa gratis), sin agregar infraestructura nueva (sin nuevas colecciones de Firestore, sin contadores persistidos).

## Diseño

### 1. Clasificación de errores

Se distingue un solo tipo de error especial: cuota agotada. Se detecta así:

```python
from google.genai import errors as genai_errors

def es_error_de_cuota(e: Exception) -> bool:
    return isinstance(e, genai_errors.ClientError) and e.code == 429
```

No se intenta distinguir si el 429 es por RPM, RPD o TPM (el mensaje de Google no es un formato estable para parsear). Tratar cualquier 429 como "este modelo no está disponible por ahora" es la opción simple y seria: en el peor caso, se pierde la oportunidad de reusar un modelo que en realidad solo estaba al límite por minuto (RPM) y se habría liberado en menos de 60 segundos — pero como la cadena de modelos siempre tiene otro candidato disponible, esto no implica pérdida de datos, solo una corrida algo más conservadora.

Cualquier otra excepción (error de red, JSON inválido, bloqueo de contenido, etc.) se trata como error "normal", no de cuota.

### 2. Lista negra por corrida (en memoria)

Dentro del bucle `for diario, url in FUENTES.items()`, justo antes de empezar a recorrer las entradas del feed de ese diario, se crea un `set()` vacío: `modelos_agotados`. Es decir, hay una lista negra nueva por diario y por corrida (nunca compartida entre Olé, Caras y Ámbito, ya que cada uno tiene su propia cuota).

- Antes de intentar un modelo de `modelos_a_probar`, si ya está en `modelos_agotados` se salta directamente, sin llamar a la API y sin sleep.
- Si una llamada falla con `es_error_de_cuota(e) == True`, se agrega ese modelo a `modelos_agotados` y se pasa al siguiente modelo de la lista **sin** el `sleep(10)` actual (no hace falta esperar para reintentar algo que no se va a reintentar en esta corrida).
- Si falla con cualquier otro error, se mantiene una pausa corta (3s, no 10s) y se pasa al siguiente modelo — ya no estamos esperando que se libere un límite de cuota, solo evitando golpear la API en un loop cerrado.

El set vive solo en memoria del proceso y se pierde al terminar la corrida — no se persiste en Firestore ni en ningún otro lado. Si la cuota diaria sigue agotada en la corrida siguiente (2 horas después), el primer intento al modelo principal vuelve a fallar una vez (gratis) y repuebla la lista negra; ese costo es aceptable y no justifica agregar un contador persistido.

### 3. Pacing dinámico del sleep entre noticias

Se agrega un diccionario con el RPM de cada modelo (los mismos valores de la tabla de arriba):

```python
RPM_POR_MODELO = {
    'gemini-3.1-flash-lite-preview': 15,
    'gemini-3.5-flash': 5,
    'gemini-3-flash-preview': 5,
    'gemini-2.5-flash-lite': 10,
    'gemini-2.5-flash': 5,
}
```

Tras una llamada exitosa, el sleep entre noticias pasa de ser un `time.sleep(5)` fijo a `time.sleep(ceil(60 / RPM_POR_MODELO[modelo_usado]) + 1)`. Con el modelo principal (15 RPM) esto da ~5s, igual que hoy; si la cascada cayó a un modelo de respaldo de 5 RPM, da ~13s, evitando autoinducir más 429.

### 4. Decisión de guardar vs. saltear la noticia

Se necesita saber, al terminar de recorrer `modelos_a_probar` para una noticia, si **alguno** de los intentos fue un error no relacionado a cuota. Se usa una bandera local por noticia: `hubo_error_no_cuota = False`, que se pone en `True` cualquier vez que se capture una excepción donde `es_error_de_cuota(e)` sea `False`.

Al final, si ningún modelo tuvo éxito:

- Si `hubo_error_no_cuota` es `False` (es decir, todos los modelos disponibles estaban en la lista negra por cuota, o fallaron con 429) → **no se llama a `guardar_en_firestore`, no se agrega el link a `enlaces_existentes`**. La noticia queda sin procesar y la próxima corrida la vuelve a intentar (el dedupe ya es por `Link`, así que esto sale gratis).
- Si `hubo_error_no_cuota` es `True` → se mantiene el comportamiento actual: se guarda con `Resumen_IA="Error en IA"`, `Categoria="General"`, y se marca el link como procesado (para no reintentar para siempre algo que falla por un motivo que no se va a resolver solo).

### 5. Fuera de alcance de este cambio

- No se agrega ningún contador de cuota persistido en Firestore (ver Enfoque B descartado: no se justifica con cuota gratuita ya holgada para el volumen actual).
- No se cambia el orden ni la lista de `modelos_a_probar`.
- No se agrega batching de noticias en un solo request a Gemini.
- **Acción manual para el usuario, no parte de este cambio de código:** confirmar en aistudio.google.com/apikey que los 3 proyectos (Olé, Caras, Ámbito) siguen en el tier gratuito, sin cuenta de facturación vinculada — es lo único que garantiza de verdad que nunca se cobre nada, incluso con esta mejora la garantía depende de eso.

## Testing

El proyecto no tiene suite de tests (no hay `pytest` en `requirements.txt`) y no se introduce una en este cambio. La verificación es manual:

1. Corrida local (`python backend.py`) observando los logs nuevos: que un modelo agotado por 429 se loguee como agregado a la lista negra, que las noticias siguientes lo salteen sin intentarlo, y que una noticia con todos los modelos en lista negra no aparezca guardada en Firestore (ni en el log de "💾 Guardado").
2. Revisión de código de las funciones puras (`es_error_de_cuota`, el cálculo de sleep) para confirmar que no dependen de mockear la API real.
