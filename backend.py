import feedparser
from google import genai
import pandas as pd
import os
import re
import requests
import time  # Para el retraso (RPM)
from bs4 import BeautifulSoup
import firebase_admin
from firebase_admin import credentials, firestore, initialize_app
from google.cloud.firestore import FieldFilter
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# ==========================================
# CONFIGURACIÓN
# ==========================================
API_KEYS = {
    "Olé": os.getenv("OLE_API_KEY"),
    "Caras": os.getenv("CARAS_API_KEY"),
    "Ambito": os.getenv("AMBITO_API_KEY")
}

FUENTES = {
    "Olé": "https://www.ole.com.ar/rss/ultimas-noticias/",
    "Caras": "https://caras.perfil.com/feed",
    "Ambito": "https://www.ambito.com/rss/pages/home.xml",
}

FIREBASE_CREDS = "firebase-creds.json"

# ==========================================
# FUNCIONES
# ==========================================
def conectar_firestore(request=None):
    try:
        if not firebase_admin._apps:
            if os.path.exists(FIREBASE_CREDS):
                cred = credentials.Certificate(FIREBASE_CREDS)
                initialize_app(cred)
            else:
                initialize_app()
        return firestore.client()
    except Exception as e:
        print(f"❌ Error al conectar con Firestore: {e}")
        return None

def guardar_en_firestore(nueva_fila, db):
    try:
        db.collection('articulos').add(nueva_fila)
        return True
    except Exception as e:
        print(f"⚠️ Error al insertar documento en Firestore: {e}")
        return False

def limpiar_html(texto):
    if not texto: return ""
    return re.sub(r'<[^>]*>', '', texto)

def extraer_cuerpo_noticia(url):
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        respuesta = requests.get(url, headers=headers, timeout=10)
        respuesta.encoding = 'utf-8'
        soup = BeautifulSoup(respuesta.text, 'html.parser')
        parrafos = soup.find_all('p')
        texto_sucio = " ".join([p.get_text() for p in parrafos if len(p.get_text()) > 60])
        return " ".join(texto_sucio.split())[:4000]
    except:
        return ""

# ==========================================
# BUCLE PRINCIPAL
# ==========================================

def ejecutar_recoleccion(request=None):
    db = conectar_firestore()
    if not db:
        return "Error de conexión a Firestore", 500

    print("🚀 Iniciando recolección de noticias...")
    
    argentina_tz = timezone(timedelta(hours=-3))

    # --- LIMPIEZA DE NOTICIAS VIEJAS ---
    # En lugar de las 00:00, borramos lo que tenga más de 24 horas de antigüedad
    inicio_hoy = datetime.now(argentina_tz) - timedelta(days=1)
    print(f"🧹 Buscando noticias anteriores al {inicio_hoy.date()} para limpiar...")
    
    docs_viejos = db.collection('articulos').where(filter=FieldFilter('Fecha_Publicacion', '<', inicio_hoy)).get()
    if len(docs_viejos) > 0:
        batch = db.batch()
        for doc in docs_viejos:
            batch.delete(doc.reference)
        batch.commit()
        print(f"🗑️ Se eliminaron {len(docs_viejos)} noticias de días anteriores.")

    fecha_carga = datetime.now(argentina_tz)

    # --- OPTIMIZACIÓN: Cargar links procesados en memoria ---
    print("🔍 Obteniendo enlaces ya procesados para evitar consultas DB redundantes...")
    enlaces_existentes = set()
    try:
        docs = db.collection('articulos').select(['Link']).get()
        enlaces_existentes = {doc.to_dict().get('Link') for doc in docs if doc.to_dict().get('Link')}
    except Exception as e:
        print(f"⚠️ Error al obtener enlaces DB: {e}")

    for diario, url in FUENTES.items():
        try:
            print(f"📰 Revisando {diario}...")
            feed = feedparser.parse(url)
            
            # Instanciar el cliente una sola vez por diario
            api_key = API_KEYS.get(diario)
            if not api_key:
                print(f"⚠️ Sin API Key para {diario}, saltando...")
                continue
            client = genai.Client(api_key=api_key)
            
            # RECORREMOS TODAS LAS NOTICIAS DEL RSS
            for entrada in feed.entries:
                link_actual = entrada.link

                # Consulta en memoria: ¿Existe este link específico? (mucho más rápido)
                if link_actual in enlaces_existentes:
                    print(f"⏭️ Noticia ya procesada: {entrada.title[:40]}...")
                    continue  # Cambiado a continue para no saltar noticias si hubo una interrupción

                print(f"🔍 Nueva noticia detectada: {entrada.title[:60]}...")
                
                # Procesamiento de fecha
                try:
                    fecha_dt = datetime(*(entrada.published_parsed[:6]), tzinfo=timezone.utc)
                    fecha_publicacion = fecha_dt.astimezone(argentina_tz)
                except:
                    fecha_publicacion = fecha_carga

                cuerpo_nota = extraer_cuerpo_noticia(link_actual)
                resumen_rss = limpiar_html(entrada.get('summary', ''))
                texto_para_ia = cuerpo_nota if len(cuerpo_nota) > 150 else resumen_rss

                # GEMINI (Modelos TAL CUAL pediste)
                resumen_ia = "Error en IA"
                modelos_a_probar = [
                    'gemini-3.1-flash-lite-preview', 
                    'gemini-3.5-flash',
                    'gemini-3-flash-preview', 
                    'gemini-2.5-flash-lite', 
                    'gemini-2.5-flash'
                ]
                
                prompt = f"Sos un periodista experto. Resumí la siguiente noticia en máximo 4 oraciones. REGLA ESTRICTA: básate ÚNICA Y EXCLUSIVAMENTE en el texto proporcionado. NO agregues información externa, no inventes datos y NO asumas nombres de personas (como entrenadores, funcionarios o jugadores) que no estén explícitamente escritos en el texto. Al final, añade una línea que diga 'Categoría: ' seguida de una sola palabra (Deportes, Política, Economía, Espectáculos, Tecnología, Salud o Sociedad) que mejor describa la noticia.\n\nNoticia:\n{texto_para_ia}"
                
                for nombre_modelo in modelos_a_probar:
                    try:
                        print(f"🤖 Intentando con: {nombre_modelo} para {diario}...")
                        response = client.models.generate_content(
                            model=nombre_modelo,
                            contents=prompt
                        )
                        respuesta_completa = response.text.strip()
                        
                        # Separar resumen de categoría
                        if "Categoría:" in respuesta_completa:
                            partes = respuesta_completa.split("Categoría:")
                            resumen_ia = partes[0].strip()
                            categoria_ia = partes[1].strip().replace(".", "")
                        else:
                            resumen_ia = respuesta_completa
                            categoria_ia = "General"

                        print(f"🤖 [{diario}] OK con: {nombre_modelo}")
                        break 
                    except Exception as e:
                        print(f"❌ Error en {diario} con {nombre_modelo}: {e}")
                        # Esperamos 10 segundos antes de intentar con otro modelo para no saturar el RPM
                        time.sleep(10)
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
                # Límite gratuito de Gemini Flash: 15 RPM (1 peticion cada 4 segs).
                print("⏳ Esperando 5s para cuidar el RPM...")
                time.sleep(5)

        except Exception as e:
            print(f"❗ Error en el bucle de {diario}: {e}")
    
    return "OK", 200

if __name__ == "__main__":
    ejecutar_recoleccion()
    print("✅ Ciclo finalizado.")