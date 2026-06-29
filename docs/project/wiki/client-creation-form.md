---
tags: [domaine/pro, projet/beeniche, type/wiki, agents]
updated: 2026-06-24
---

# Client creation form

Statut : **ready-for-agent**. Cette page capture le grill du 2026-06-24. Objectif de la session : griller + persister, pas implémenter.

## Intention

Créer le client dans l'admin BeeNice, garder la référence du responsable commercial côté client, puis donner à BeeNice le lien d'invitation rep pour connecter les calendriers.

Le prochain agent ne doit pas redemander ces décisions : elles sont figées pour la v0.

## Scope v0

À faire :
- upgrade de `/admin/settings`, carte **Clients** seulement ; conserver le layout deux colonnes Clients + Callers ; carte Callers inchangée.
- formulaire création client avec 5 champs requis : entreprise, prénom contact, nom contact, téléphone, email.
- persister le contact dans `clients`.
- après création : client visible dans la liste + bouton persistant pour copier le lien rep absolu `/connect/:connectionInviteToken`.
- tests backend + frontend ciblés + build.

Hors scope :
- implémentation pendant la session de grill.
- création d'un user auth pour le contact.
- portail client / Vue Client miroir.
- flags consentement/automation/onboarding status.
- connexion Nylas elle-même.
- full demo seed reshape.
- édition des contacts client existants (ajouté en TODO séparé).
- cleanup complet `routingMode` (ajouté en TODO séparé).

## Décisions produit

Contact :
- le contact principal = **responsable commercial** du client.
- ce n'est pas un rep, pas un caller, pas un user auth.
- utilisé maintenant comme référence admin ; utilisable plus tard pour automation, mais sans ajouter de champ automation maintenant.

Champs :
- `name` : nom entreprise.
- `primaryContactFirstName` : prénom responsable commercial.
- `primaryContactLastName` : nom responsable commercial.
- `primaryContactPhone` : téléphone responsable commercial.
- `primaryContactEmail` : email responsable commercial.

Required : les 5 champs bloquent la création si vides.

Validation :
- côté client + côté serveur.
- email : trim + lowercase avant stockage.
- téléphone : E.164 strict, regex `^\+[1-9]\d{7,14}$` ; pas de dépendance externe.
- doublon email : warning **avant submit**, pas blocage. Le UI vérifie dans le `SettingsPayload` déjà chargé ; si doublon, `window.confirm`, puis submit seulement si l'admin confirme.

Timezone :
- ne pas afficher de timezone au create client.
- default client = `Europe/Paris`.
- raison : tous les clients BeeNice sont dans ce fuseau pour v0.
- l'ancien item F4b devient un bonus plus tard côté caller/prospect : voir les disponibilités dans le fuseau du prospect appelé, sans changer la timezone client.

Routing :
- ne pas afficher nb reps, mode routing, ni % dans la création client.
- les reps se connectent via le lien `/connect/:inviteToken`.
- les % vivent sur `/admin/settings/connections`, sur les reps connectés.
- `routingMode` est devenu métier inutile après PR #4 ; pour cette tâche, ne pas l'envoyer depuis le UI.
- backend peut ignorer un payload legacy `routingMode` en attendant cleanup. Cleanup DB/API = TODO séparé.

Lien généré :
- exposer/copy le lien rep absolu : `${window.location.origin}/connect/:connectionInviteToken`.
- ne pas mettre le caller workspace en success principal : il est moins utile tant que les reps n'ont pas connecté leur calendrier.

## Implémentation attendue

Backend :
- ajouter colonnes client :
  - `primary_contact_first_name`
  - `primary_contact_last_name`
  - `primary_contact_phone`
  - `primary_contact_email`
- politique migration : colonnes `NOT NULL` avec defaults demo pour lignes déjà présentes : `Demo`, `Contact`, `+33000000000`, `demo-contact@example.com`.
- étendre mapping persistence + `listSettings()`.
- `createClient()` valide les 5 champs, normalise email, force default timezone `Europe/Paris`, crée toujours le booking link/invite comme aujourd'hui.
- ne pas créer de user auth.
- ignorer `routingMode` entrant pour cette slice ; ne pas supprimer la colonne ici.

Frontend :
- `AdminSettingsPage` : remplacer le form compact actuel par champs : entreprise, prénom, nom, téléphone, email.
- utiliser `type="email"` pour email, `inputMode="tel"` pour phone ; helper format `+336...`.
- avant submit, chercher doublon case-insensitive dans `payload.clients[].primaryContactEmail`; si doublon autre client, `window.confirm`.
- reset form après succès.
- toast simple “Client ajouté.” ; pas besoin d'action toast.
- ligne client : entreprise, “Responsable commercial”, email, phone, bouton copier lien rep, toggle actif.
- ne plus afficher timezone/routing dans la liste client.

Types/API :
- `SettingsPayload.clients[]` inclut les 4 champs contact.
- `ClientCreationResponse.client` hérite de ces champs.
- garder `routingMode` dans response shape pour compat tant que cleanup pas fait, mais ne pas l'utiliser dans le UI de création.

Seeds :
- ajouter données contact minimales crédibles au seed pour que l'écran settings ne soit pas vide.
- ne pas faire le full demo reshape ici.

## Tests attendus

Backend : `mvp/server/lib/state-admin.test.mjs`
- createClient rejette champ vide.
- createClient rejette email invalide.
- createClient rejette téléphone non E.164.
- createClient lower-case email.
- createClient persiste les 4 champs contact.
- createClient crée toujours workspace/link/buffers.

Frontend : nouveau `mvp/src/pages/AdminSettingsPage.test.tsx`
- rend les champs requis.
- submit envoie `name`, `primaryContactFirstName`, `primaryContactLastName`, `primaryContactPhone`, `primaryContactEmail`.
- doublon email déclenche `window.confirm`; cancel = pas de POST ; confirm = POST.
- ligne client affiche contact + bouton copier lien absolu `/connect/:token`.

Commandes :
- `node --test mvp/server/lib/state-admin.test.mjs`
- `npm run test:web`
- `npm run build`

## Notes pour prochain agent

Avant code :
1. `git checkout main && git pull --ff-only` ; les merges confirmés sont PR #5 `2175a98` puis PR #4 `f6873e9`.
2. relire `TODO.md`, cette note, puis inspecter `AdminSettingsPage`, `state.mjs`, `database.mjs`, `store/persistence.mjs`, `types.ts`.
3. pas besoin de Context7 : pas de nouvelle lib, pas de question API externe.
4. utiliser le plus petit diff : pas de wizard, pas de nouvelle route, pas de dependency, pas de modal custom.

Après code :
- update `ARCHITECTURE.md` car schema `clients` change.
- update `TODO.md` + `LOG.md` via handoff.
