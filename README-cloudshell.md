gcloud run jobs deploy noticias-backend-job --project=gen-lang-client-0099709380 --source . --region us-central1 --task-timeout 1200 --memory 512Mi --command python --args backend.py

eso es para deploy cada vez que modifico backend.
Como las variables de entorno ya estan en cloud no es necesario set env ars de vuelta
luego firebase deploy --only hosting
