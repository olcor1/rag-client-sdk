# rag-client-sdk (V3)

## Ce que fait la V3
- **Chat/Generate** peuvent utiliser les fichiers du **projet B** (via sélection).
- Par défaut, la V3 fait un **SYNC (sans IA)** des fichiers sélectionnés vers le serveur A avant d'appeler **/ai/chat** ou **/ai/generate**.
- Option **Inline fichiers (debug)** pour forcer l'inclusion des fichiers dans `inputs.files`.

## Variables (Replit Secrets)
- `RAG_URL` : URL du serveur A (sans slash final)
- `RAG_SECRET` : la clé `x-api-key`
- `RAG_PROJECT_ID` : projectId par défaut

## Dans ton projet B
Ajoute dans `package.json`:
```json
"scripts": {
  "rag:ui": "rag-ui"
}
```

Puis:
- `npm install github:olcor1/rag-client-sdk`
- `npm run rag:ui`

UI: http://localhost:3030
