# Noticias IA 📰🤖

Un agregador y resumidor de noticias automatizado construido con Python, Firebase y Google Gemini AI.

## 🚀 Descripción del Proyecto

Este proyecto consiste en un backend que recolecta periódicamente noticias de diferentes diarios argentinos (Olé, Caras y Ámbito) a través de sus feeds RSS. Utiliza web scraping para extraer el cuerpo de las noticias y la inteligencia artificial de **Google Gemini** para generar un resumen conciso (párrafo de entre 40 y 60 palabras) y clasificar cada artículo en una categoría (Deportes, Política, Economía, Espectáculos, Tecnología, Salud o Sociedad). 
 
La información procesada se almacena en una base de datos **Firestore** para ser consumida por un frontend alojado en **Firebase Hosting**.

## ✨ Características Principales

- **Extracción Automática:** Lectura de feeds RSS y scraping del contenido de las noticias usando `feedparser` y `BeautifulSoup`.
- **Inteligencia Artificial:** Resúmenes y categorización inteligente de texto usando la API de Google Gemini (integrando los últimos modelos de la familia Flash), con salida estructurada (JSON Schema) para garantizar categorías válidas.
- **Gestión de Base de Datos:** Almacenamiento en Google Cloud Firestore con un sistema de limpieza automática que elimina las noticias con más de 24 horas de antigüedad.
- **Control de RPM:** Manejo inteligente de tiempos de espera (`sleep`) para no exceder los límites de uso de la capa gratuita de las APIs.
- **Despliegue en la Nube:** Configurado para ejecutarse periódicamente como un Job en **Google Cloud Run**.
- **Frontend Interactivo:** Interfaz de usuario con filtros combinables por categoría y diario, además de una barra de búsqueda en tiempo real sobre los títulos y resúmenes de las noticias cargadas.

## 🛠️ Tecnologías Utilizadas

- **Lenguaje:** Python 3
- **IA:** Google GenAI SDK (familia de modelos Gemini Flash)
- **Base de Datos:** Firebase / Google Cloud Firestore (`firebase-admin`)
- **Frontend:** HTML5, CSS3, JavaScript (sin frameworks)
- **Web Scraping:** `BeautifulSoup4`, `requests`
- **RSS:** `feedparser`
- **Despliegue:** Google Cloud Run, Firebase Hosting

## ⚙️ Configuración y Ejecución Local

1. **Clonar el repositorio:**
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd noticias-ia
   ```

2. **Instalar dependencias:**
   Se recomienda usar un entorno virtual (venv).
   ```bash
   pip install -r requirements.txt
   ```

3. **Variables de Entorno:**
   Crea un archivo `.env` en la raíz del proyecto con tus API Keys de Gemini:
   ```env
   OLE_API_KEY=tu_api_key_aqui
   CARAS_API_KEY=tu_api_key_aqui
   AMBITO_API_KEY=tu_api_key_aqui
   ```

4. **Credenciales de Firebase:**
   Descarga tu archivo JSON con las credenciales de la cuenta de servicio de Firebase y guárdalo en la raíz del proyecto con el nombre `firebase-creds.json`.

5. **Ejecutar el script:**
   ```bash
   python backend.py
   ```

## ☁️ Despliegue en Google Cloud Run

El proyecto está configurado para desplegarse como un Cloud Run Job utilizando Google Cloud CLI. Para actualizar el backend en la nube, ejecuta:

```bash
gcloud run jobs deploy noticias-backend-job --project=<TU_ID_DE_PROYECTO> --source . --region us-central1 --task-timeout 1200 --memory 512Mi --command python --args backend.py --set-env-vars "OLE_API_KEY=tu_key,CARAS_API_KEY=tu_key,AMBITO_API_KEY=tu_key"
```

Y para desplegar cambios del frontend:
```bash
firebase deploy --only hosting
```

### Ejecución periódica (Cloud Scheduler)

El Job no corre solo: un trigger de **Cloud Scheduler** lo invoca cada cierto intervalo (la frecuencia se ajustó varias veces, así que conviene chequearla en vez de asumirla):

```bash
gcloud scheduler jobs describe noticias-backend-job-scheduler-trigger --location us-central1 --project=<TU_ID_DE_PROYECTO>
```

Para crearlo desde cero (reemplazando el intervalo según necesidad):
```bash
gcloud scheduler jobs create http noticias-backend-job-scheduler-trigger \
  --location us-central1 \
  --schedule "0 */2 * * *" \
  --uri "https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/<TU_ID_DE_PROYECTO>/jobs/noticias-backend-job:run" \
  --http-method POST \
  --oauth-service-account-email <SERVICE_ACCOUNT_EMAIL>
```