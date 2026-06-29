---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
updated: 2026-06-02
---

# 06 - Configurer le connecteur Microsoft dans Nylas

Cette note vient apres Azure App Registration et permissions Graph.

## Etat deja fait cote Nylas

- Plan Nylas Calendar achete.
- App Nylas : BeeNiceCal.
- Environnement : Production.
- Region : EU.
- Callback BeeNice local autorise.
- Callback platform : web.

Ce qu il reste a faire ici : brancher l app Azure dans le connecteur Microsoft de BeeNiceCal Production.

## Ou aller

Dans Nylas Dashboard :

```text
BeeNiceCal
-> Production
-> Connectors ou Integrations
-> Microsoft
```

Ne va pas dans une ancienne app sandbox.

## Valeurs Azure a mettre dans Nylas

Depuis l app Microsoft Entra creee en note 04 :

- Azure Application client ID ;
- Azure client secret value ;
- tenant = common.

Attention : ces valeurs Azure vont dans Nylas, pas dans .env BeeNice.

## Scopes a configurer

Utilise exactement :

```text
offline_access openid profile User.Read Calendars.ReadWrite
```

Ils doivent correspondre aux permissions Graph de la note 05.

## Callback dans Nylas

Le callback local est deja ajoute :

```text
http://localhost:8787/api/admin/integrations/nylas/callback
```

Platform :

```text
web
```

Garde le.

Plus tard, ajoute aussi le callback production :

```text
https://<domaine-prod>/api/admin/integrations/nylas/callback
```

## Confusion a eviter

Il y a deux familles de credentials.

### Credentials Nylas

Dans .env BeeNice :

```text
MVP_NYLAS_API_KEY
MVP_NYLAS_CLIENT_ID
```

Ce sont les credentials de BeeNiceCal Production.

### Credentials Azure

Dans le connecteur Microsoft Nylas :

```text
Azure Application client ID
Azure client secret
```

Ce sont les credentials de l app Microsoft Entra.

Ne les melange pas.

## Edge cases

### Tu ne vois pas Microsoft connector

Verifie que tu es dans BeeNiceCal Production et que le plan Calendar est actif.

### Nylas demande une region ou un callback Microsoft

Pour Microsoft Azure, le redirect URI cote Azure doit etre :

```text
https://api.eu.nylas.com/v3/connect/callback
```

### Secret Azure expire ou mal copie

Le flow peut demarrer puis echouer au moment de l echange token.

Dans ce cas, recree un secret Azure et mets Nylas a jour.

## Checklist

- [ ] Tu es dans BeeNiceCal Production.
- [ ] Microsoft connector ouvert.
- [ ] Azure Application client ID ajoute.
- [ ] Azure client secret ajoute.
- [ ] Tenant = common.
- [ ] Scopes = offline_access openid profile User.Read Calendars.ReadWrite.
- [ ] Callback local BeeNice toujours present.
- [ ] Aucun credential sandbox utilise.

## Prochaine note

Passe a [[07 - Configurer BeeNice et les variables env]].
