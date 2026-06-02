import {spawnSync} from "node:child_process";

const path =
    "6 - Main Notes/Pro/BeeNice/Nylas Issues Microsoft/02 - Verifier les plans gratuits et payants.md";

const content = `---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
updated: 2026-06-02
---

# 02 - Verifier les plans gratuits et payants

Cette note a ete mise a jour avec l'etat reel du projet. Tu n'es plus en train de choisir entre free et paid : tu as deja achete le plan Nylas Calendar et tu as cree l'app Production.

## Etat actuel verifie

- Plan Nylas Calendar achete.
- App Nylas : BeeNiceCal.
- Environnement : Production.
- Region Nylas : EU.
- Callback local autorise dans Nylas :
  - http://localhost:8787/api/admin/integrations/nylas/callback
- Platform callback : web.
- Le repo charge maintenant .env automatiquement.
- Le serveur voit bien :
  - providerMode = nylas
  - nylasConfigured = true
  - apiUri = https://api.eu.nylas.com

Conclusion : tu peux considerer la partie "compte Nylas payant + app production + callback local" comme faite.

## Ce qu'il reste a verifier dans cette note

L'objectif n'est plus de savoir si le plan gratuit suffit.

L'objectif maintenant est de verifier que tu ne melanges pas :
- l'ancienne app sandbox ;
- les anciennes cles sandbox ;
- la nouvelle app BeeNiceCal Production ;
- les futures credentials Azure.

## Verification 1 - Tu es bien dans BeeNiceCal Production

Dans Nylas Dashboard, verifie que tu es dans :

~~~~text
BeeNiceCal
-> Production
~~~~

Ne configure pas Microsoft dans une ancienne app Nylas.

Ne copie pas les cles d'une app sandbox.

## Verification 2 - Les cles .env sont les cles BeeNiceCal Production

Dans le fichier .env local, tu dois avoir les valeurs de BeeNiceCal Production :

~~~~bash
MVP_CALENDAR_PROVIDER=nylas
MVP_NYLAS_API_KEY=<API key BeeNiceCal Production>
MVP_NYLAS_CLIENT_ID=<Client ID BeeNiceCal Production>
MVP_NYLAS_CALLBACK_URL=http://localhost:8787/api/admin/integrations/nylas/callback
MVP_NYLAS_API_URI=https://api.eu.nylas.com
~~~~

Attention importante :

MVP_NYLAS_CLIENT_ID est le client ID Nylas de BeeNiceCal Production.

Ce n'est pas l'Azure Application client ID.

L'Azure Application client ID sera utilise plus tard dans le connecteur Microsoft de Nylas.

## Verification 3 - Le callback local est autorise

Deja verifie par API Nylas.

Callback present :

~~~~text
http://localhost:8787/api/admin/integrations/nylas/callback
~~~~

Platform :

~~~~text
web
~~~~

Cette partie est OK.

## Verification 4 - Region EU

Comme l'app BeeNiceCal utilise l'API EU, toutes les URLs Nylas importantes doivent etre EU.

Dans BeeNice :

~~~~bash
MVP_NYLAS_API_URI=https://api.eu.nylas.com
~~~~

Dans Azure, quand tu creeras l'app Microsoft Entra, le redirect URI devra etre :

~~~~text
https://api.eu.nylas.com/v3/connect/callback
~~~~

Pas api.us.

## Ce que le plan payant change

Le plan payant retire le doute "est-ce que le free tier suffit pour tester Cos ?".

Mais il ajoute une responsabilite de suivi :
- surveiller les grants actifs ;
- nettoyer les grants de test inutiles ;
- suivre le cout par calendrier connecte ;
- eviter de connecter plusieurs fois le meme compte inutilement pendant les tests.

## Grants Nylas - ce qu'il faut comprendre

Un grant Nylas correspond a un compte connecte.

Pour BeeNice :
- 1 rep connecte = generalement 1 grant ;
- Google et Microsoft sont tous les deux des grants ;
- les grants de test peuvent compter dans l'usage ;
- supprimer un rep dans BeeNice ne supprime pas forcement automatiquement le grant dans Nylas.

Bonne pratique :
- garde les comptes de test identifies ;
- supprime les grants inutiles dans Nylas apres les tests ;
- note quels comptes sont de vrais comptes client.

## Ce qui peut encore bloquer meme avec le plan payant

Le plan Nylas payant ne resout pas automatiquement les politiques Microsoft du client.

Cos peut encore bloquer si :
- le tenant Microsoft impose un consentement admin ;
- le user consent est desactive ;
- l'app Microsoft n'est pas encore creee ;
- le connecteur Microsoft dans Nylas n'a pas les credentials Azure ;
- les permissions Graph ne sont pas correctement configurees ;
- le tenant client refuse les apps non verifiees.

Donc si Cos bloque plus tard, ne reviens pas tout de suite sur le plan Nylas.

Diagnostique d'abord :
1. Azure App Registration.
2. Connecteur Microsoft Nylas.
3. Consentement admin Microsoft.
4. Scopes Graph.
5. Callback et region.

## Checklist actuelle

- [x] Plan Nylas Calendar achete.
- [x] App Nylas creee : BeeNiceCal.
- [x] Environnement utilise : Production.
- [x] Region Nylas identifiee : EU.
- [x] .env charge par le serveur.
- [x] Nylas configured = true.
- [x] Callback local ajoute dans Nylas.
- [x] Callback platform = web.
- [ ] Anciennes cles sandbox revoquees ou archivees clairement.
- [ ] Connecteur Microsoft configure dans BeeNiceCal Production.
- [ ] App Microsoft Entra creee.
- [ ] Redirect URI Azure = https://api.eu.nylas.com/v3/connect/callback.
- [ ] Permissions Graph configurees.
- [ ] Test Microsoft personnel effectue.
- [ ] Test Microsoft Cos effectue.

## Prochaine note

Passe maintenant a :

[[03 - Choisir region URLs et environnement]]

Pour toi, la decision est deja prise :

~~~~text
Region Nylas = EU
~~~~

Donc la note 03 doit surtout te servir a memoriser la distinction :

- callback Azure vers Nylas : https://api.eu.nylas.com/v3/connect/callback
- callback Nylas vers BeeNice : http://localhost:8787/api/admin/integrations/nylas/callback
`;

const result = spawnSync(
    "obsidian",
    ["vault=Adam's Vault", "create", `path=${path}`, `content=${content}`, "overwrite"],
    {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]},
);

if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status ?? 1);
}

process.stdout.write(result.stdout);
