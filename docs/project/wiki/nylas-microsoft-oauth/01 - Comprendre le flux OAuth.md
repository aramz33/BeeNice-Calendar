---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
---

# 01 - Comprendre le flux OAuth

Avant de cliquer dans Azure ou Nylas, comprends le flux. C'est la base pour ne pas confondre les callbacks.

## Le flux reel

~~~~text
Rep client
-> page BeeNice /connect/:inviteToken
-> API BeeNice /api/connect/:token/start
-> Nylas /v3/connect/auth
-> Microsoft login
-> callback Nylas
-> callback BeeNice
-> base SQLite : rep_calendar_connections.status = connected
~~~~

BeeNice ne parle pas directement a Microsoft pour OAuth. BeeNice demande a Nylas de lancer Hosted OAuth. Microsoft redirige vers Nylas. Nylas redirige ensuite vers BeeNice.

## Les deux callbacks a ne pas confondre

### Callback Azure vers Nylas

Ce callback est configure dans Microsoft Entra.

US :
https://api.us.nylas.com/v3/connect/callback

EU :
https://api.eu.nylas.com/v3/connect/callback

C'est Nylas qui recoit le code Microsoft.

### Callback Nylas vers BeeNice

Ce callback est configure dans Nylas et dans la variable BeeNice MVP_NYLAS_CALLBACK_URL.

Local :
http://localhost:8787/api/admin/integrations/nylas/callback

Production :
https://<domaine-prod>/api/admin/integrations/nylas/callback

Dans le code BeeNice, la route existe dans :
- mvp/server/lib/http/admin-routes.mjs

Le provider lit la variable dans :
- mvp/server/lib/provider.mjs

## Ce qui doit etre vrai

- Microsoft Entra connait le callback Nylas, pas le callback BeeNice.
- Nylas connait le callback BeeNice.
- BeeNice utilise exactement le meme callback que celui declare dans Nylas.
- La region Nylas est coherente partout : US partout ou EU partout.

## Erreur mentale classique

Si tu mets https://<domaine-prod>/api/admin/integrations/nylas/callback dans Azure, tu crées probablement une erreur de redirect URI.

Azure doit appeler Nylas. Nylas doit appeler BeeNice.

## Comment verifier dans BeeNice

Dans mvp/server/lib/provider.mjs :
- DEFAULT_API_URI vaut https://api.us.nylas.com par defaut.
- CALLBACK_URL lit MVP_NYLAS_CALLBACK_URL.
- startRepConnection construit l'URL /v3/connect/auth.
- finalizeRepConnection traite le retour sur /api/admin/integrations/nylas/callback.

Si tu passes en region EU, ajoute aussi :
MVP_NYLAS_API_URI=https://api.eu.nylas.com
