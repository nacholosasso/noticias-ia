FROM python:3.11-slim

# Evita que Python genere archivos .pyc y permite que los logs salgan directo a la consola
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# Copiamos los archivos de requerimientos primero para aprovechar el cache
# Copiamos los archivos necesarios
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos el resto del código
COPY . .

# Usamos functions-framework para que la función acepte pedidos HTTP de Cloud Scheduler
CMD exec functions-framework --target=ejecutar_recoleccion --source=backend.py --port=$PORT