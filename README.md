# BeeNice Calendar

Repo dédié au MVP du hub calendrier Be Nice.

L'application vit dans [`mvp/`](./mvp), avec le frontend, la couche UI partagée
et l'API locale regroupés au même endroit. Elle couvre :

- un workspace caller avec disponibilités live consolidées
- une navigation hebdomadaire sur 12 semaines pour la prise de rendez-vous
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

## Staging local same-origin

Après le build, le serveur Node peut servir le frontend compilé et l’API sur la
même origine, ce qui simplifie les callbacks OAuth Nylas :

```bash
npm run build
npm run start
```

Par défaut :

- app + API : `http://127.0.0.1:8787`

## Modes calendrier

Mode mock par défaut :

```bash
MVP_CALENDAR_PROVIDER=mock npm run dev
```

Mode Nylas :

```bash
cp .env.example .env
# Remplir .env avec les cles Nylas BeeNiceCal Production.
npm run dev
```

Si Google affiche `Erreur 403 : access_denied` pendant une connexion Nylas,
voir [`docs/google-oauth-403.md`](./docs/google-oauth-403.md).
