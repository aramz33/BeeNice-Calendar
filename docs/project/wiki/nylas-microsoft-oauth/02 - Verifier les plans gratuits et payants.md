---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
updated: 2026-06-02
---

# 02 - Verifier les plans gratuits et payants

Cette note part maintenant du contexte reel du projet.

## Etat actuel

- Plan Nylas Calendar achete.
- App Nylas creee : BeeNiceCal.
- Environnement : Production.
- Region Nylas : EU.
- Callback local autorise dans Nylas.
- Callback platform : web.
- Le serveur BeeNice charge .env automatiquement.
- Le serveur indique nylasConfigured = true.

Conclusion : la question free vs paid est reglee. Tu es sur le bon plan pour avancer.

## Ce que tu dois encore verifier

Le risque maintenant est de melanger ancienne config sandbox et nouvelle config Production.

Verifie dans Nylas Dashboard :

- tu es bien dans BeeNiceCal ;
- tu es bien dans Production ;
- les cles copiees dans .env viennent de BeeNiceCal Production ;
- le connecteur Microsoft sera cree dans BeeNiceCal Production ;
- les anciennes cles sandbox ne sont plus utilisees dans ton terminal, dans le VPS, ou dans un ancien fichier local.

## Verifier .env

Ton .env local doit contenir :

```bash
MVP_CALENDAR_PROVIDER=nylas
MVP_NYLAS_API_KEY=<API key BeeNiceCal Production>
MVP_NYLAS_CLIENT_ID=<Client ID Nylas BeeNiceCal Production>
MVP_NYLAS_CALLBACK_URL=http://localhost:8787/api/admin/integrations/nylas/callback
MVP_NYLAS_API_URI=https://api.eu.nylas.com
```

Point critique : MVP_NYLAS_CLIENT_ID est le Client ID Nylas, pas le Client ID Azure.

## Verifier le callback

Deja verifie par API Nylas :

```text
http://localhost:8787/api/admin/integrations/nylas/callback
platform = web
```

Donc tu peux passer a Azure sans revenir sur ce point.

## Ce que le plan payant ne resout pas

Le plan Nylas Calendar ne resout pas les politiques Microsoft de Cos.

Cos peut encore bloquer si :

- le tenant Microsoft exige admin consent ;
- le user consent est desactive ;
- l app Microsoft Entra BeeNice n existe pas encore ;
- le connecteur Microsoft Nylas ne contient pas encore les credentials Azure ;
- les permissions Graph ne sont pas configurees ;
- le tenant refuse une app non verifiee.

Donc si Cos bloque plus tard, diagnostique Microsoft et Azure avant de remettre Nylas en cause.

## Gestion des grants

Un grant Nylas correspond a un compte connecte.

Bonne pratique :

- note quels comptes sont des tests ;
- supprime les grants de test inutiles apres recette ;
- evite de reconnecter le meme compte plusieurs fois sans raison ;
- surveille la facturation dans Nylas.

## Checklist

- [ ] Connecteur Microsoft configure dans BeeNiceCal Production.
- [ ] App Microsoft Entra creee.
- [ ] Azure Redirect URI = https://api.eu.nylas.com/v3/connect/callback.
- [x] Plan Nylas Calendar achete.
- [x] App BeeNiceCal creee.
- [x] Environnement Production utilise.
- [x] Region EU identifiee.
- [x] .env charge par le serveur.
- [x] Nylas configured = true.
- [x] Callback local autorise.
- [x] Callback platform = web.
- [x] Anciennes cles sandbox archivees ou revoquees.

## Prochaine note

Passe a [[03 - Choisir region URLs et environnement]].
