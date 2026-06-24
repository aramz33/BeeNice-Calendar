---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
updated: 2026-06-02
---

# 09 - Tester avec un rep Microsoft

Ne fais cette note qu apres :

- app Azure creee ;
- permissions Graph configurees ;
- connecteur Microsoft configure dans BeeNiceCal Production ;
- .env BeeNice charge et valide.

## Objectif

Verifier que le flow complet fonctionne :

```text
BeeNice -> Nylas EU -> Microsoft -> Nylas EU -> BeeNice callback -> DB connected
```

## Ordre de test recommande

### Test 1 - Compte Microsoft personnel

Objectif : verifier que le connecteur Microsoft marche hors tenant entreprise strict.

Exemple : Outlook ou Hotmail.

### Test 2 - Compte Microsoft entreprise que tu controles

Objectif : verifier le cas enterprise avec admin consent facile.

### Test 3 - Compte Cos

Objectif : verifier le vrai client prioritaire.

Ne commence pas par Cos si tu peux eviter. Tu veux isoler les problemes avant de solliciter le client.

## Procedure BeeNice

1. Lance le serveur :

```bash
npm run dev
```

2. Va dans la console admin.

```text
/admin/bookings
```

3. Ouvre la vue connexions.

4. Copie le lien de connexion rep du client.

5. Ouvre le lien :

```text
/connect/:inviteToken
```

6. Remplis le formulaire rep.

7. Choisis Microsoft.

8. Clique Connexion.

9. Observe les redirections :

```text
BeeNice -> Nylas -> Microsoft -> Nylas -> BeeNice
```

## Ce que tu dois voir apres succes

Dans BeeNice, le rep doit passer connecte.

En base, dans rep_calendar_connections :

- provider = nylas ;
- status = connected ;
- provider_grant_id non vide ;
- provider_email non vide ;
- last_error vide ou null.

## Commande DB utile

```bash
sqlite3 mvp/server/data/mvp.sqlite "select reps.name, reps.email, rep_calendar_connections.provider, rep_calendar_connections.provider_email, rep_calendar_connections.provider_grant_id, rep_calendar_connections.status, rep_calendar_connections.last_error from rep_calendar_connections join reps on reps.id = rep_calendar_connections.rep_id;"
```

## Test calendrier apres connexion

1. Va sur le workspace caller.
2. Verifie que le rep est connecte.
3. Cree un booking test.
4. Verifie que l evenement apparait dans le calendrier Microsoft.
5. Cree un evenement manuel dans Microsoft et verifie que les disponibilites BeeNice changent.

## Traces a noter pour chaque test

- date ;
- compte teste ;
- tenant ;
- app Nylas = BeeNiceCal Production ;
- region = EU ;
- message erreur si echec ;
- status DB ;
- last_error DB.

## Edge cases

### Microsoft ouvre le mauvais compte

Ouvre une fenetre privee ou deconnecte les sessions Microsoft.

Compare provider_email avec l email attendu du rep.

### Connexion OK mais aucun slot

Verifier : rep actif, client actif, booking link actif, timezone, busy intervals, provider_grant_id.

### Connexion OK mais pas de creation evenement

Verifier Calendars.ReadWrite, grant Nylas, logs serveur, last_error.

## Checklist

- [ ] Test Microsoft personnel effectue.
- [ ] Test entreprise controle effectue si possible.
- [ ] Test Cos effectue apres diagnostic de base.
- [ ] status = connected en DB.
- [ ] provider_grant_id present.
- [ ] Booking test cree dans Microsoft.
- [ ] Disponibilites Microsoft prises en compte.

## Prochaine note

Passe a [[10 - Diagnostiquer les erreurs frequentes]].


## 2026-06-02 - Resultat test compte Microsoft personnel

Test reussi.

Contexte : compte Microsoft personnel utilise avec identification via adresse Gmail, puis creation/usage d une adresse Outlook liee au compte Microsoft.

Resultat :

- Connexion Microsoft via BeeNice/Nylas reussie.
- Le calendrier Outlook du compte est accessible.
- Creation d evenement test validee.

Conclusion : la chaine technique locale fonctionne pour un compte Microsoft personnel : BeeNice -> Nylas EU -> Microsoft -> Nylas EU -> BeeNice callback.

Ce que ce test valide :

- .env BeeNice OK.
- BeeNiceCal Production OK.
- Callback local Nylas OK.
- App Microsoft Entra accepte les comptes Microsoft personnels.
- Connecteur Microsoft Nylas fonctionne.
- Calendrier Outlook personnel accessible.

Ce que ce test ne valide pas encore :

- Consentement admin d un tenant entreprise comme Cos.
- Politique Microsoft enterprise du client.
- Cas mailbox Exchange entreprise.
