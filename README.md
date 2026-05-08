# Noticias IA 📰🤖

Un agregador y resumidor de noticias automatizado construido con Python, Firebase y Google Gemini AI.

## 🚀 Descripción del Proyecto

Este proyecto consiste en un backend que recolecta periódicamente noticias de diferentes diarios argentinos (Olé, Caras y Ámbito) a través de sus feeds RSS. Utiliza web scraping para extraer el cuerpo de las noticias y la inteligencia artificial de **Google Gemini** para generar un resumen conciso (máximo 4 oraciones) y clasificar cada artículo en una categoría (Deportes, Política, Economía, Espectáculos, Tecnología, Salud o Sociedad). 

La información procesada se almacena en una base de datos **Firestore** para ser consumida por un frontend alojado en **Firebase Hosting**.

## ✨ Características Principales

- **Extracción Automática:** Lectura de feeds RSS y scraping del contenido de las noticias usando `feedparser` y `BeautifulSoup`.
- **Inteligencia Artificial:** Resúmenes y categorización inteligente de texto usando la API de Google Gemini (integrando los últimos modelos de la familia Flash).
- **Gestión de Base de Datos:** Almacenamiento en Google Cloud Firestore con un sistema de limpieza automática que elimina las noticias con más de 24 horas de antigüedad.
- **Control de RPM:** Manejo inteligente de tiempos de espera (`sleep`) para no exceder los límites de uso de la capa gratuita de las APIs.
- **Despliegue en la Nube:** Configurado para ejecutarse periódicamente como un Job en **Google Cloud Run**.

## 🛠️ Tecnologías Utilizadas

- **Lenguaje:** Python 3
- **IA:** Google GenAI SDK (`gemini-2.5-flash`, etc.)
- **Base de Datos:** Firebase / Google Cloud Firestore (`firebase-admin`)
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
   pip install feedparser google-genai pandas requests beautifulsoup4 firebase-admin python-dotenv
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