---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
updated: 2026-06-02
---

# 05 - Configurer les permissions Graph

Cette note vient apres la creation de l app Microsoft Entra.

## Etat actuel

Tu as ajoute les permissions Microsoft Graph recommandees, plus une permission supplementaire :

```text
offline_access
openid
profile
User.Read
Calendars.ReadWrite
Calendars.ReadWrite.Shared
```

Tu as aussi clique Grant admin consent pour ton tenant.

Donc, pour ton tenant Azure, les permissions sont accordees.

Attention : cela ne veut pas dire que le tenant Microsoft de Cos a donne consentement. Chaque tenant client devra consentir separement si sa politique Microsoft l exige.

## Permissions configurees

Dans Azure :

```text
App Registration BeeNice Calendar
-> API permissions
-> Microsoft Graph
-> Delegated permissions
```

Permissions presentes :

```text
offline_access
openid
profile
User.Read
Calendars.ReadWrite
Calendars.ReadWrite.Shared
```

## Pourquoi ces permissions

offline_access : permet a Nylas de maintenir la connexion sans refaire signer le rep a chaque fois.

openid et profile : scopes de base pour identifier l utilisateur.

User.Read : lecture basique du profil utilisateur.

Calendars.ReadWrite : lecture disponibilites + creation/modification/suppression des RDV dans le calendrier principal du rep.

Calendars.ReadWrite.Shared : permet d agir sur des calendriers partages ou delegues accessibles par l utilisateur. Ce n etait pas strictement necessaire pour le MVP si BeeNice utilise seulement le calendrier principal, mais ce n est pas incoherent pour Microsoft Calendar si certains reps travaillent sur des calendriers partages.

## Point de vigilance sur Calendars.ReadWrite.Shared

Cette permission ajoute une capacite supplementaire. Elle peut rendre le consent screen legerement plus sensible pour certains admins IT.

Garde-la si tu penses que BeeNice ou Cos peut utiliser des calendriers partages.

Si Cos ou un autre client trouve les permissions trop larges, la premiere simplification a tester serait de retirer Calendars.ReadWrite.Shared et garder seulement Calendars.ReadWrite.

## Permissions a ne pas ajouter maintenant

Ne pas ajouter :

```text
Mail.Read
Mail.ReadWrite
Mail.Send
Contacts.Read
Files.Read
Directory.Read.All
```

BeeNice Calendar ne lit pas les emails, ne lit pas les contacts, et ne parcourt pas le tenant Microsoft.

Ces permissions inutiles peuvent faire refuser le consentement par Cos.

## Admin consent

Tu as grant admin consent dans ton tenant.

Effet :

- les utilisateurs de ton tenant peuvent tester plus facilement ;
- cela valide que les permissions sont acceptables dans ton tenant ;
- cela ne consent pas automatiquement pour Cos.

Pour Cos, il faudra soit :

- que le tenant autorise user consent ;
- soit qu un admin Microsoft Cos donne admin consent ;
- soit que Cos approuve explicitement l app BeeNice Calendar.

## Coherence avec Nylas

Dans le connecteur Microsoft de BeeNiceCal Production, les scopes doivent matcher les permissions Azure.

Donc utilise :

```text
offline_access openid profile User.Read Calendars.ReadWrite Calendars.ReadWrite.Shared
```

Si tu decides plus tard de retirer Calendars.ReadWrite.Shared, retire-la dans Azure et dans Nylas.

## Cas Calendars.Read vs Calendars.ReadWrite

Calendars.Read ne suffit pas.

BeeNice doit creer des evenements dans le calendrier du rep. Il faut donc Calendars.ReadWrite.

## Edge cases

### Cos refuse Calendars.ReadWrite.Shared

Retire cette permission et reteste avec seulement Calendars.ReadWrite.

Explique que le MVP peut fonctionner sur calendrier principal sans shared si le client ne veut pas cette portee.

### Cos refuse Calendars.ReadWrite

Explique que BeeNice doit creer les RDV dans l agenda du commercial. Sans write, le produit ne peut pas fonctionner.

### Admin consent affiche encore Not granted for Cos

Normal. Ton grant admin consent concerne ton tenant, pas le tenant Cos.

### Les scopes Nylas ne matchent pas Azure

Le flow peut demander une permission absente ou echouer. Garde Azure et Nylas synchronises.

## Checklist

- [x] offline_access present.
- [x] openid present.
- [x] profile present.
- [x] User.Read present.
- [x] Calendars.ReadWrite present.
- [x] Calendars.ReadWrite.Shared present.
- [x] Admin consent accorde dans ton tenant.
- [x] Aucun scope Mail ajoute.
- [x] Aucun scope Contacts ajoute.
- [x] Aucun scope Directory ajoute.
- [ ] Les memes scopes sont configures dans le connecteur Microsoft Nylas.
- [ ] Si client IT trouve les scopes trop larges, reevaluer Calendars.ReadWrite.Shared.

## Prochaine note

Passe a [[06 - Configurer le connecteur Microsoft dans Nylas]].
