---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
updated: 2026-06-02
---

# 03 - Choisir region URLs et environnement

Cette note part du contexte actuel : la region est deja choisie.

## Decision actuelle

BeeNiceCal Production utilise Nylas EU.

Donc toutes les URLs Nylas doivent utiliser :

```text
https://api.eu.nylas.com
```

Dans .env, tu dois garder :

```bash
MVP_NYLAS_API_URI=https://api.eu.nylas.com
```

## Les deux callbacks

Il y a deux callbacks differents.

### 1. Callback Microsoft Azure vers Nylas

Celui ci sera configure dans Azure quand tu creeras l app Microsoft Entra.

Pour BeeNiceCal EU, il doit etre :

```text
https://api.eu.nylas.com/v3/connect/callback
```

Pas api.us.

Azure ne doit pas appeler BeeNice directement.

### 2. Callback Nylas vers BeeNice

Celui ci est deja autorise dans Nylas.

```text
http://localhost:8787/api/admin/integrations/nylas/callback
```

Il est aussi dans .env :

```bash
MVP_NYLAS_CALLBACK_URL=http://localhost:8787/api/admin/integrations/nylas/callback
```

Nylas appelle BeeNice apres avoir fini le flow Microsoft.

## Pourquoi cette distinction compte

Si tu mets le callback BeeNice dans Azure, tu risques une erreur redirect URI mismatch.

Si tu mets api.us dans Azure alors que BeeNiceCal est EU, tu risques un flow incoherent.

Si .env et le callback autorise dans Nylas ne matchent pas exactement, Nylas peut refuser le retour vers BeeNice.

## Etat local actuel

- BeeNiceCal Production : EU.
- .env charge par le serveur.
- MVP_NYLAS_API_URI = https://api.eu.nylas.com.
- Callback local BeeNice autorise dans Nylas.
- Platform du callback : web.

Donc localement, ce point est OK.

## Quand tu passeras en production

Tu ajouteras un second callback dans Nylas, platform web :

```text
https://<domaine-prod>/api/admin/integrations/nylas/callback
```

Et tu changeras la variable serveur production :

```bash
MVP_NYLAS_CALLBACK_URL=https://<domaine-prod>/api/admin/integrations/nylas/callback
```

Azure ne changera pas si tu restes sur Nylas EU. Azure gardera :

```text
https://api.eu.nylas.com/v3/connect/callback
```

## Edge cases

### Tu vois api.us quelque part

Stop. Verifie si tu es dans une ancienne app Nylas ou dans une vieille doc.

Pour BeeNiceCal Production actuel, api.us ne doit pas etre utilise.

### Tu vois localhost dans Azure

Stop. Localhost est le callback BeeNice dans Nylas, pas le redirect URI Azure.

### Tu changes de domaine production

Tu ne touches pas Azure.

Tu mets seulement a jour :

- callback URI dans Nylas ;
- MVP_NYLAS_CALLBACK_URL sur le serveur production.

## Checklist

- [x] Region Nylas choisie : EU.
- [x] MVP_NYLAS_API_URI configure en EU.
- [x] Callback local BeeNice autorise dans Nylas.
- [x] Platform callback = web.
- [ ] Azure Redirect URI a creer : https://api.eu.nylas.com/v3/connect/callback.
- [ ] Callback production BeeNice a ajouter plus tard quand le domaine existe.

## Prochaine note

Passe a [[04 - Creer l application Microsoft Entra]].
