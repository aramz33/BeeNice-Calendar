---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
updated: 2026-06-02
---

# 10 - Diagnostiquer les erreurs frequentes

Cette table part du contexte actuel : BeeNiceCal Production EU, .env OK, callback local autorise.

## Regle de diagnostic

Ne change pas tout en meme temps.

Pour chaque erreur, identifie la couche :

```text
BeeNice config -> Nylas app -> Azure app -> Microsoft tenant client -> DB
```

## Redirect URI mismatch

Cause probable maintenant :

- Azure utilise api.us au lieu de api.eu ;
- Azure contient le callback BeeNice localhost par erreur ;
- le connecteur Microsoft Nylas utilise une ancienne app ;
- le callback production BeeNice manque plus tard.

A verifier :

```text
Azure Redirect URI = https://api.eu.nylas.com/v3/connect/callback
Nylas callback BeeNice local = http://localhost:8787/api/admin/integrations/nylas/callback
```

## Admin approval required

Cause probable :

- tenant Microsoft du client bloque user consent ;
- Cos exige admin consent ;
- app non approuvee dans le tenant ;
- publisher non verifie.

Action :

- ne change pas les cles Nylas ;
- prepare le message admin de la note 08 ;
- demande a un admin Microsoft du client de consentir.

## invalid_client

Cause probable :

- Azure client secret incorrect dans Nylas ;
- Azure Application client ID incorrect dans Nylas ;
- secret expire ;
- confusion Azure Client ID vs Nylas Client ID.

Action :

- recreer un secret Azure ;
- le remettre dans le connecteur Microsoft BeeNiceCal Production ;
- ne pas modifier MVP_NYLAS_CLIENT_ID sauf si tu as vraiment copie un mauvais Client ID Nylas.

## invalid_grant

Cause probable :

- code OAuth deja utilise ;
- flow relance depuis une vieille URL ;
- callback ou region incoherente ;
- session Microsoft stale.

Action :

- relancer depuis /connect/:inviteToken ;
- ouvrir en fenetre privee ;
- verifier region EU partout.

## Nylas configured false

Cause probable BeeNice :

- .env absent ;
- MVP_NYLAS_API_KEY vide ;
- MVP_NYLAS_CLIENT_ID vide ;
- commande lancee depuis le mauvais dossier.

Mais actuellement, tu as deja verifie nylasConfigured = true.

Si cela redevient false, c est un probleme local de .env ou de working directory.

## Connexion reussie mais status DB reste auth_required

Cause probable :

- Nylas ne revient pas vers BeeNice ;
- callback BeeNice non appele ;
- serveur local arrete ;
- callback mal configure si tu changes de domaine ;
- erreur dans finalizeRepConnection.

Action :

- verifier logs serveur ;
- verifier last_error ;
- verifier que npm run dev tourne encore.

## Connexion OK mais mauvais email connecte

Cause probable :

- Microsoft session deja ouverte avec un autre compte ;
- utilisateur a choisi un autre compte.

Action :

- verifier provider_email en DB ;
- refaire en fenetre privee.

## Connexion OK mais pas de booking cree

Cause probable :

- Calendars.ReadWrite absent ;
- erreur Nylas create event ;
- grant invalide ;
- calendrier primary non disponible.

Action :

- lire last_error ;
- verifier scopes Azure et Nylas ;
- tester avec un compte Microsoft simple.

## Fiche a remplir a chaque bug

```text
Date :
Compte :
Tenant :
Nylas app : BeeNiceCal Production
Region : EU
Etape du flow :
Message Microsoft :
Message Nylas :
Status DB :
last_error DB :
Hypothese :
Action suivante :
```

## Checklist

- [ ] Je sais dans quelle couche le bug se trouve.
- [ ] Je ne change pas plusieurs configs a la fois.
- [ ] Je garde le message erreur exact.
- [ ] Je verifie DB avant de conclure.
- [ ] Je documente le resultat dans l issue Obsidian.

## Prochaine note

Passe a [[11 - Checklist production]].
