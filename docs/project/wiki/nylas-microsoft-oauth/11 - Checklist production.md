---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
updated: 2026-06-02
---

# 11 - Checklist production

Cette checklist resume l etat actuel et ce qui reste pour debloquer Microsoft Enterprise.

## Deja fait

### Nylas

- [x] Plan Nylas Calendar achete.
- [x] App Nylas creee : BeeNiceCal.
- [x] Environnement : Production.
- [x] Region : EU.
- [x] API URI BeeNice = https://api.eu.nylas.com.
- [x] Callback local ajoute dans Nylas.
- [x] Callback local platform = web.
- [x] Callback local verifie par API Nylas.

### BeeNice repo

- [x] .env local cree.
- [x] .env ignore par Git.
- [x] .env.example cree.
- [x] Loader .env ajoute cote serveur.
- [x] provider.mjs charge .env avant lecture des variables.
- [x] Nylas configured = true.
- [x] Tests serveur passes apres ajout du loader.

## A faire maintenant

### Azure App Registration

- [ ] Creer app Microsoft Entra : BeeNice Calendar.
- [ ] Account type = any organizational directory + personal Microsoft accounts.
- [ ] Platform = Web.
- [ ] Redirect URI = https://api.eu.nylas.com/v3/connect/callback.
- [ ] Copier Azure Application client ID.
- [ ] Creer Azure client secret.
- [ ] Noter expiration du secret.

### Permissions Graph

- [ ] offline_access.
- [ ] openid.
- [ ] profile.
- [ ] User.Read.
- [ ] Calendars.ReadWrite.
- [ ] Aucun scope Mail.
- [ ] Aucun scope Contacts.
- [ ] Aucun scope Directory.

### Connecteur Microsoft Nylas

- [ ] Ouvrir BeeNiceCal Production.
- [ ] Configurer Microsoft connector.
- [ ] Coller Azure Application client ID.
- [ ] Coller Azure client secret.
- [ ] Tenant = common.
- [ ] Scopes identiques a Azure.
- [ ] Verifier que le callback local BeeNice reste present.

### Test local

- [ ] npm run dev.
- [ ] Ouvrir un lien /connect/:inviteToken.
- [ ] Choisir Microsoft.
- [ ] Verifier redirection Nylas EU.
- [ ] Verifier redirection Microsoft.
- [ ] Verifier retour BeeNice callback.
- [ ] status DB = connected.
- [ ] provider_grant_id present.
- [ ] provider_email correct.
- [ ] Booking test cree dans calendrier Microsoft.

## A faire pour Cos

- [ ] Identifier admin Microsoft Cos.
- [ ] Envoyer message permissions si admin consent requis.
- [ ] Obtenir consentement admin ou erreur exacte.
- [ ] Tester avec un vrai compte Cos.
- [ ] Documenter resultat dans l issue Obsidian.

## A faire plus tard pour production BeeNice

Quand le domaine de production existe :

- [ ] Ajouter callback production dans Nylas platform web.
- [ ] Mettre MVP_NYLAS_CALLBACK_URL production.
- [ ] Verifier HTTPS.
- [ ] Verifier reverse proxy /api.
- [ ] Ne pas changer Azure Redirect URI tant que Nylas reste EU.

Azure Redirect URI restera :

```text
https://api.eu.nylas.com/v3/connect/callback
```

## Definition de done

L issue Microsoft est resolue quand :

1. Un compte Microsoft se connecte via BeeNiceCal Production.
2. Le rep passe connected en DB.
3. provider_grant_id est present.
4. BeeNice lit les disponibilites Microsoft.
5. BeeNice cree un evenement dans le calendrier Microsoft.
6. Un compte Cos passe le flow ou le blocage Cos est documente comme admin consent tenant.

## Notes suivantes selon situation

Si le flow echoue : [[10 - Diagnostiquer les erreurs frequentes]].

Si Cos bloque : [[08 - Gerer le consentement admin client]].

Si tu changes de domaine : [[03 - Choisir region URLs et environnement]].


## 2026-06-02 - Avancement test Microsoft personnel

Valide :

- Test avec compte Microsoft personnel reussi.
- Compte identifie via Gmail, avec adresse Outlook liee.
- Calendrier Outlook accessible.
- Creation d evenement test reussie.

Impact checklist :

- Le flux BeeNice -> Nylas EU -> Microsoft -> Nylas EU -> BeeNice callback fonctionne pour compte personnel.
- Il reste a tester le cas entreprise Cos ou un tenant Microsoft enterprise de test.
- Si Cos bloque, le prochain diagnostic porte sur admin consent / politique tenant, pas sur la config Nylas de base.
