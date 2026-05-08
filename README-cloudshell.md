gcloud run jobs deploy noticias-backend-job --project=gen-lang-client-0099709380 --source . --region us-central1 --task-timeout 1200 --memory 512Mi --command python --args backend.py --set-env-vars "OLE_API_KEY=tu_api_key,CARAS_API_KEY=tu_api_key,AMBITO_API_KEY=tu_api_key"

eso es para deploy cada vez que modifico backend
luego firebase deploy --only hosting
