---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
updated: 2026-06-02
---

# 08 - Gerer le consentement admin client

Cette note sert a comprendre et gerer le cas entreprise **COSY RH**.

## Etat actuel

Le test Microsoft personnel est reussi.

Ce que cela valide :

- BeeNiceCal Production fonctionne ;
- Nylas EU fonctionne ;
- callback local fonctionne ;
- app Microsoft Entra fonctionne pour un compte personnel ;
- le connecteur Microsoft Nylas fonctionne ;
- creation d evenement calendrier validee.

Ce que cela ne valide pas encore :

- les politiques Microsoft 365 de COSY RH ;
- le consentement admin du tenant COSY RH ;
- le cas d une boite Exchange professionnelle COSY RH.

## C est quoi un tenant Microsoft 365 ?

Un tenant Microsoft 365, c est l environnement Microsoft cloud d une organisation.

Il contient generalement :

- les utilisateurs de l entreprise ;
- les boites mail Exchange / Outlook ;
- les calendriers ;
- les domaines email de l entreprise ;
- les politiques de securite ;
- les droits admin ;
- les applications autorisees.

Pour une PME, il y a en general un tenant principal pour toute l entreprise.

Exemple simplifie :

```text
COSY RH
-> tenant Microsoft 365 COSY RH
   -> utilisateurs COSY RH
   -> calendriers COSY RH
   -> politiques de consentement
   -> admins Microsoft COSY RH
```

Certaines grosses organisations peuvent avoir plusieurs tenants, mais pour BeeNice tu dois raisonner ainsi : un client BeeNice Microsoft = probablement un tenant Microsoft client.

## Qui peut donner le consentement ?

Pas toi, sauf si tu es admin du tenant COSY RH.

Pas Nylas.

Pas BeeNice, sauf si BeeNice administre le Microsoft 365 de COSY RH.

Le consentement doit venir d une personne qui a les droits admin sur le tenant Microsoft 365 de COSY RH.

Souvent c est :

- le responsable IT ;
- un prestataire informatique ;
- le fondateur si c est lui qui administre Microsoft 365 ;
- un admin global Microsoft 365.

## Que veut dire demander le consentement admin ?

Cela ne veut pas dire demander un acces admin au tenant.

Cela veut dire : demander a un admin Microsoft 365 de COSY RH d autoriser l application BeeNice Calendar a etre utilisee par les utilisateurs COSY RH, avec les permissions declarees.

Permissions actuelles :

```text
User.Read
Calendars.ReadWrite
Calendars.ReadWrite.Shared
offline_access
openid
profile
```

En clair, l admin accepte que les commerciaux COSY RH puissent connecter leur calendrier a BeeNice Calendar via Nylas.

L application agit ensuite avec le compte du commercial connecte. Elle n obtient pas un acces admin global au tenant.

## Quand demander a COSY RH ?

Il y a deux strategies.

### Strategie prudente recommandee

Tu contactes COSY RH avant de faire tester un rep, pour eviter qu un commercial tombe sur un message Microsoft incompris.

Tu demandes :

1. Qui gere Microsoft 365 chez COSY RH ?
2. Est-ce que les utilisateurs peuvent consentir eux memes a des apps externes ?
3. Si non, qui peut approuver l application BeeNice Calendar ?

C est la meilleure approche si tu veux eviter un blocage au moment du test client.

### Strategie reactive

Tu fais tester un rep COSY RH.

Si Microsoft affiche admin approval required, tu arretes le test et tu contactes l admin Microsoft COSY RH.

Cette strategie marche, mais elle donne une moins bonne impression car le client voit le blocage en direct.

## Ce que tu demandes exactement

Tu ne demandes pas :

```text
Donnez moi un acces admin Microsoft.
```

Tu demandes :

```text
Pouvez-vous approuver l application BeeNice Calendar dans votre tenant Microsoft 365 afin que vos commerciaux puissent connecter leur calendrier ?
```

## Mail plus clair a envoyer

Objet : Validation Microsoft 365 pour connecter les calendriers COSY RH a BeeNice Calendar

Bonjour,

Pour le test BeeNice Calendar avec COSY RH, nous devons connecter le calendrier Microsoft des commerciaux concernes.

BeeNice Calendar utilise Nylas comme provider technique pour gerer la connexion Microsoft, la synchronisation calendrier et la creation des rendez vous.

Selon la configuration de votre tenant Microsoft 365, un utilisateur peut etre autorise a connecter son calendrier directement, ou bien une validation par un administrateur Microsoft 365 peut etre requise.

L application BeeNice Calendar demande uniquement des permissions liees au profil de base et aux calendriers :

- User.Read
- Calendars.ReadWrite
- Calendars.ReadWrite.Shared
- offline_access
- openid
- profile

Elle ne demande pas acces aux emails, aux fichiers, aux contacts, ni au repertoire complet de l entreprise.

Pouvez-vous nous indiquer qui gere Microsoft 365 chez COSY RH, et si cette personne peut approuver l application BeeNice Calendar pour permettre aux commerciaux de connecter leur calendrier ?

Merci.

## Admin consent URL

Si l admin Microsoft COSY RH veut approuver directement, tu peux fournir une URL de consentement admin.

Modele :

```text
https://login.microsoftonline.com/common/adminconsent?client_id=<AZURE_APPLICATION_CLIENT_ID>&redirect_uri=https://api.eu.nylas.com/v3/connect/callback
```

Attention :

- client_id = Azure Application client ID ;
- ce n est pas MVP_NYLAS_CLIENT_ID ;
- redirect_uri = callback Nylas EU ;
- la personne qui clique doit etre admin du tenant COSY RH.

## Ce que l admin COSY RH verra

Il verra une demande de consentement pour l application BeeNice Calendar.

Il verra les permissions calendrier/profil.

Il devra accepter pour son organisation.

Apres acceptation, les commerciaux COSY RH devraient pouvoir connecter leur calendrier plus facilement.

## Edge cases

### COSY RH autorise le user consent

Dans ce cas, un commercial COSY RH peut peut-etre connecter son calendrier sans admin.

Tu n as rien de plus a faire tant que le test passe.

### COSY RH bloque les apps externes

Il faut un admin Microsoft COSY RH.

Ce n est pas un bug BeeNice.

### COSY RH refuse Calendars.ReadWrite.Shared

Tu peux retirer cette permission si les commerciaux n utilisent pas de calendriers partages.

Garde Calendars.ReadWrite, car BeeNice doit creer des evenements.

### COSY RH demande pourquoi Nylas apparait

Reponse : Nylas est le provider technique qui gere OAuth, tokens, sync calendrier et webhooks. BeeNice utilise Nylas pour eviter de stocker directement les tokens Microsoft.

## Checklist

- [x] Test Microsoft personnel reussi.
- [x] App BeeNice Calendar fonctionne pour compte personnel.
- [ ] Identifier qui gere Microsoft 365 chez COSY RH.
- [ ] Demander si user consent est autorise.
- [ ] Si besoin, envoyer l admin consent URL.
- [ ] Obtenir consentement admin ou erreur exacte.
- [ ] Tester avec un vrai compte COSY RH.
- [ ] Documenter le resultat dans l issue Obsidian.

## Prochaine note

Passe a [[09 - Tester avec un rep Microsoft]].


## Correction nom client

Le nom correct du client est Cozy RH, avec un Z. Les anciennes mentions COSY RH / Cos doivent etre comprises comme Cozy RH.

Comme Adam n'a pas directement les contacts Cozy RH, le message de demande de validation Microsoft 365 doit passer par Julien/BeeNice.
