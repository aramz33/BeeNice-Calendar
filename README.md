# BeeNice Calendar

Repo dédié au MVP du hub calendrier Be Nice.

Le code principal de la démo est isolé dans [`mvp/`](./mvp) et couvre :

- un workspace caller avec disponibilités live consolidées
- un routing pondéré avec qualification par taille de société
- une console admin avec historique de statuts
- une API locale persistante avec SQLite
- un mode `mock` et un squelette d’intégration Nylas

## Lancer la démo

```bash
npm install
npm run dev
```

Par défaut :

- frontend : `http://localhost:5174`
- API : `http://localhost:8787`

## Build

```bash
npm run build
```

## Modes calendrier

Mode mock par défaut :

```bash
MVP_CALENDAR_PROVIDER=mock npm run dev
```

Mode Nylas :

```bash
MVP_CALENDAR_PROVIDER=nylas
MVP_NYLAS_API_KEY=...
MVP_NYLAS_CLIENT_ID=...
MVP_NYLAS_CALLBACK_URL=http://localhost:8787/api/admin/integrations/nylas/callback
npm run dev
```
