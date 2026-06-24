---
tags: [agents, beeniceapp, security]
status: todo
---

# Auth secret fallback en dur

## Problème

 utilise un secret fallback hardcodé :

```js
secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-in-production-32ch"
```

Si `BETTER_AUTH_SECRET` n'est pas défini en production, le serveur démarre avec une valeur connue publiquement. N'importe qui peut forger des sessions admin valides.

## Fix à faire avant le déploiement VPS

Remplacer par un fail-fast au démarrage :

```js
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) throw new Error("BETTER_AUTH_SECRET env var is required");
```

Et provisionner la variable dans le `.env` du VPS avec une valeur générée (ex: `openssl rand -base64 32`).