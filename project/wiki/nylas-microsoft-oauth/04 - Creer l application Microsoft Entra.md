---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
updated: 2026-06-02
---

# 04 - Creer l application Microsoft Entra

Tu n as pas encore commence Azure. Cette note est la prochaine vraie action.

## Objectif

Creer une app Microsoft Entra qui autorise Nylas a connecter les calendriers Microsoft des reps BeeNice.

Cette app Azure sera utilisee par le connecteur Microsoft de BeeNiceCal Production.

## Avant de commencer

Verifie que tu as sous la main :

- acces a https://portal.azure.com ;
- un compte qui peut creer une App Registration ;
- la region Nylas actuelle : EU ;
- le redirect URI Nylas EU : https://api.eu.nylas.com/v3/connect/callback.

## Chemin dans Azure

Va dans :

```text
Microsoft Entra ID
-> App registrations
-> New registration
```

## Champs a remplir

Name :

```text
BeeNice Calendar
```

Supported account types :

```text
Accounts in any organizational directory and personal Microsoft accounts
```

Pourquoi :

- Cos est dans un tenant Microsoft externe ;
- BeeNice aura potentiellement plusieurs clients Microsoft ;
- les comptes Outlook ou Hotmail personnels restent possibles.

Redirect URI :

```text
Platform = Web
URI = https://api.eu.nylas.com/v3/connect/callback
```

Important : ce redirect URI est celui de Nylas EU, pas celui de BeeNice.

## Ce que tu dois eviter

Ne choisis pas single tenant.

Ne mets pas :

```text
http://localhost:8787/api/admin/integrations/nylas/callback
```

dans Azure.

Ce callback localhost est deja dans Nylas, pas dans Azure.

Ne mets pas api.us, car BeeNiceCal Production est en EU.

## Apres creation

Copie et note ces valeurs :

- Application client ID  : 
  a83d15b9-fb38-442e-ad60-f6ef7ac30899
- Directory tenant ID :
  90913657-b731-4e29-a680-ec7757edddc3
- Object ID si besoin pour retrouver l app.
  cbee22de-5d28-4b25-a40a-79f71e6109e1

Tu utiliseras surtout Application client ID dans Nylas.

Attention : cet Azure Application client ID ne va pas dans MVP_NYLAS_CLIENT_ID.

## Creer le client secret

Dans Azure :

```text
Certificates and secrets
-> Client secrets
-> New client secret
```

Choisis une expiration raisonnable, puis copie la secret value immediatement.
secret value : 
<REDACTED — ne jamais committer ; stocker dans un gestionnaire de secrets>
secret id : 
<redacted>
expiration date : 
6/1/2028

La value ne sera plus visible apres fermeture.

A noter dans un gestionnaire de secrets :

- Azure Application client ID ;
- Azure client secret value ;
- date expiration du secret.

## Edge cases

### Tu ne peux pas creer une App Registration

Tu n as pas les droits sur ce tenant. Il faut utiliser un tenant ou tu as les droits, ou demander a un admin.

### Azure demande une verification publisher

Ne bloque pas tout de suite. Cree d abord l app. Si Cos refuse ensuite une app non verifiee, ce sera une sous etape de durcissement.

### Tu hesites sur le tenant

Pour le MVP, cree une app multi tenant BeeNice. Ne cree pas une app par client.

Chaque client Microsoft donnera ensuite consentement sur son propre tenant.

## Checklist

- [ ] App Registration creee.
- [ ] Nom = BeeNice Calendar.
- [ ] Account type = any organizational directory + personal Microsoft accounts.
- [ ] Platform = Web.
- [ ] Redirect URI = https://api.eu.nylas.com/v3/connect/callback.
- [ ] Application client ID copie.
- [ ] Client secret cree et copie.
- [ ] Expiration du secret notee.
- [ ] Aucun callback localhost mis dans Azure.

## Prochaine note

Passe a [[05 - Configurer les permissions Graph]].
