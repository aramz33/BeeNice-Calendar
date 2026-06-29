---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
updated: 2026-06-02
---

# 07 - Configurer BeeNice et les variables env

Cette note est presque faite dans le repo.

## Etat actuel

Le repo charge maintenant .env automatiquement via :

```text
mvp/server/lib/load-env.mjs
```

Le provider Nylas importe ce loader avant de lire les variables.

Le serveur a deja indique :

```text
providerMode = nylas
nylasConfigured = true
callbackUrl = http://localhost:8787/api/admin/integrations/nylas/callback
apiUri = https://api.eu.nylas.com
```

Donc BeeNice lit bien .env.

## .env attendu

Ton .env local doit contenir :

```bash
MVP_CALENDAR_PROVIDER=nylas
MVP_NYLAS_API_KEY=<API key BeeNiceCal Production>
MVP_NYLAS_CLIENT_ID=<Client ID Nylas BeeNiceCal Production>
MVP_NYLAS_CALLBACK_URL=http://localhost:8787/api/admin/integrations/nylas/callback
MVP_NYLAS_API_URI=https://api.eu.nylas.com
MVP_NYLAS_WEBHOOK_SECRET=
```

## Point critique

MVP_NYLAS_CLIENT_ID est le Client ID Nylas BeeNiceCal Production.

Ce n est pas l Azure Application client ID.

L Azure Application client ID va dans le connecteur Microsoft Nylas, pas dans BeeNice .env.

## Comment verifier sans afficher les secrets

Depuis le repo :

```bash
node -e "import("./mvp/server/lib/provider.mjs").then(({createCalendarProvider}) => console.log(createCalendarProvider().getOverview()))"
```

Tu dois voir :

```text
providerMode: nylas
nylasConfigured: true
apiUri: https://api.eu.nylas.com
callbackUrl: http://localhost:8787/api/admin/integrations/nylas/callback
```

## Lancer BeeNice

Quand Azure et le connecteur Microsoft seront configures :

```bash
npm run dev
```

Tu n as plus besoin de passer les variables a la main dans la commande.

## Edge cases

### nylasConfigured = false

Verifie :

- MVP_NYLAS_API_KEY non vide ;
- MVP_NYLAS_CLIENT_ID non vide ;
- MVP_NYLAS_CALLBACK_URL non vide ;
- .env est a la racine du repo ;
- tu lances la commande depuis la racine du repo.

### Mauvaise region

Si apiUri affiche api.us.nylas.com, corrige :

```bash
MVP_NYLAS_API_URI=https://api.eu.nylas.com
```

### Anciennes cles sandbox

Si le flow part vers une ancienne app Nylas ou ne trouve pas le callback, les cles dans .env ne sont probablement pas celles de BeeNiceCal Production.

## Checklist

- [x] .env existe localement.
- [x] .env est ignore par Git.
- [x] .env.example existe pour documenter les variables.
- [x] BeeNice charge .env automatiquement.
- [x] providerMode = nylas.
- [x] nylasConfigured = true.
- [x] apiUri = https://api.eu.nylas.com.
- [x] callback local correct.
- [ ] Apres Azure, tester un vrai flow Microsoft.

## Prochaine note

Passe a [[08 - Gerer le consentement admin client]].


## Correction commande de verification

Utilise cette commande avec des quotes simples autour du code Node :

```bash
node -e 'import("./mvp/server/lib/provider.mjs").then(({ createCalendarProvider }) => console.log(createCalendarProvider().getOverview()))'
```

Erreur a eviter : ne pas mettre le chemin import entre quotes doubles si toute la commande est deja entre quotes doubles, sinon le shell enleve les quotes et Node recoit import(./mvp/...), ce qui donne SyntaxError: Unexpected token .
