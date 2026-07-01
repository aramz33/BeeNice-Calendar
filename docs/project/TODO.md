---
tags: [domaine/pro, projet/beeniche, type/todo, agents]
updated: 2026-07-01 (session 13)
---

# BeeNice Calendar — TODO

## Resume
- **Goal:** outil B2B de booking pour les sales reps. **Cible : v0 live début juillet 2026** (Julien, réunion [[LOG|11-06]]). Premier client = **Cozy RH** (avec un Z, Microsoft).
- **State:** **Démo client faite (25-06, Julien + Camille).** PRs #2→#11 mergées sur `main` (`dff791c`). **PR #12 ouverte** (`feat/widen-booking-window`, `bf2dc9b`) : fenêtre de booking élargie **08h–20h** de bout en bout + **fix prefill reposition** (prénom/nom/email) — verte (backend 215 · web 40 · build), **à review/merger**. **Liste des 5 statuts + les 2 docs prod-auth (MS + Google) envoyés à Julien** (Adam, fait).
- **Next:** **cible 1er juillet 2026** (objectif principal), **repli 7 juillet** ; **prochaine réunion 1er juillet 13h**. (a) **Merger PR #12** ; (b) en attente externe : **consentement admin Microsoft pour Cozy RH** via **Julien/BeeNice** (brief prêt → [[brief-julien-auth-prod]]) + retour Julien sur l'ordre des 5 statuts (fige le mapping Google Sheet côté Corentin). Prochain chantier code = **Google Sheets sync bidirectionnelle** (coord. Corentin) ou autres fixes UI démo restants.
  - ⚠️ **À confirmer à Julien** (métier) : amplitude bookable codée **08h–20h** — valider que c'est la bonne plage d'ouverture.
  - ⚠️ **Bug latent noté** (hors scope PR #12) : `availability.mjs` génère les créneaux en **heure locale serveur**, pas `Europe/Paris` explicite → sur VPS UTC, 08-20 local = 10-22 Paris. À traiter avant déploiement.
  - ⚠️ DB dev (`mvp/server/data/mvp.sqlite` + WAL) **wipée puis reseedée** cette session → reconnecter les calendriers (c'est justement la démo live).
  - **F3 livré** : les 3 surfaces calendrier (caller, agenda admin, picker reposition) tournent sur `@schedule-x/react` v4. `SlotPicker`/`AgendaBoard`/`lib/calendar.ts` supprimés.
- **Run:** `npm run dev` (API 8787 + web 5174) · tests : `npm run test:web` et `node --test mvp/server/lib/**/*.test.mjs mvp/server/lib/*.test.mjs mvp/server/lib/http/*.test.mjs`
- **Aparté (session 13) :** graphify knowledge graph construit (`graphify-out/`, 749 nodes / 43 communautés). 5 questions d'exploration à reprendre → [[LOG|session 13]]. Lancer via `graphify query "<q>"`. N'a pas touché au code produit.
- Contexte → [[overview]] · Specs → [[functional-spec]] · Archi → [[ARCHITECTURE]] · wiki → [[wiki/index|wiki]] · Historique → [[LOG]]

## Checklist

### Livré
- [x] B1 Hono · B2 auth better-auth · B3 `caller/workspaces` + response shape · B4 réassignation tâche · B5 RSVP prospect
- [x] F1 login + guards de route · F2 vue caller unifiée
- [x] T1 buffer défaut 15 min · T2 suppression champ taille société
- [x] Durcissement auth (CORS, trusted origins, seeding idempotent, tests) — `5c5635f`, [PR #2](https://github.com/aramz33/BeeNice-Calendar/pull/2) **mergée** (`9790693`)
- [x] Cleanup safe legacy caller/API — suppression `BookingWorkspacePage`, `useBookingWorkspaceController`, `AccordionSection`, `useTheme`, endpoints read `/api/book`; `/book/:slug` reste redirect et availability/bookings/create/cancel/SSE restent actifs
- [x] **Statuts RDV — 6 valeurs de Julien** : MVN + Refus de bout en bout, [PR #3](https://github.com/aramz33/BeeNice-Calendar/pull/3) **mergée** (`5ed4055`). Contrat → `docs/status-contract.md`. ✅ confirmé Julien : **MVN = terminal** (pas de tâche) ; **Refus = pas dispo à ce créneau → tâche de repositionnement**.
- [x] **Tooling Node natif SQLite** — [PR #5](https://github.com/aramz33/BeeNice-Calendar/pull/5) **mergée** (`2175a98`) : `.nvmrc`, `engines`, `engine-strict`, script `npm run rebuild:native`.
- [x] **Round robin pondéré par % par rep** — [PR #4](https://github.com/aramz33/BeeNice-Calendar/pull/4) **mergée** (`f6873e9`) : `reps.weight_pct`, % effectif live, somme=100 par construction, UI sur page connexions reps.
- [x] **Création client — formulaire v0** — [PR #6](https://github.com/aramz33/BeeNice-Calendar/pull/6) **mergée** (`0c9a528`). Spec [[client-creation-form]], détail [[LOG|session 5]].
- [x] **Drop rep role/seniority + fix callback OAuth public-invite** — [PR #7](https://github.com/aramz33/BeeNice-Calendar/pull/7) **mergée** (`166647a`/`ea43249`). Champ « Rôle » retiré du lien de connexion rep ; colonne `reps.seniority` droppée de bout en bout (migration `DROP COLUMN` idempotente). **Bug réel corrigé** : le flux OAuth public-invite tapait le callback admin-guardé → `{"error":"Unauthorized"}` ; exemption du seul path `/api/admin/integrations/nylas/callback` (pas de reconfig Nylas). Doc Google prod ajoutée → `docs/google-oauth-production-setup.md`. Backend 215/215 + web 34/34 + build verts.

### Démo — priorité immédiate · audience = **Julien + Camille** (opérateurs/admins BeeNice)
- [ ] **Valider auth Nylas Google ET Microsoft** sur connexions réelles  → verify: les deux providers connectent un calendrier et les créneaux s'affichent
  - risque n°1 (externe, infaisable à 9h) · DB dev wipée cette session → reconnecter les calendriers
- [x] **Reshape seed pour la narration démo** — [PR #9](https://github.com/aramz33/BeeNice-Calendar/pull/9). Les 6 reps ont un `weight_pct` (somme=100 par client : 50/30/20 et 60/25/15) ; `insertClient` persiste enfin `primary_contact_*` (les 2 clients montraient le défaut « Demo Contact ») + contact Doctolib ajouté. Tâches de repositionnement : **rien à seeder**, `initializeFollowUpTasks` (`state.mjs`) les crée au boot (5 vivantes : Meetic, Qonto, Alan, Leboncoin, Spendesk). Backend 215/215 + web 34/34 + build verts.
  - reset DB : supprimer `mvp/server/data/mvp.sqlite*` puis relancer (seed ne tourne que si `clients` vide)

### Chemin critique — début juillet
- [x] **Retirer MVN** — décision Julien (démo 25-06) : MVN est un **statut de lead, pas un statut de RDV**. Statuts **6 → 5**. **PR #11 mergée** (`dff791c`, squash). Enums + UI + seed nettoyés ; les normaliseurs legacy de `database.mjs` remappent `mvn → not_qualified` (lecture des anciennes lignes tolérée) ; `docs/status-contract.md` → 5 dispositions. Backend 214 · web 40 · build verts ; DB reseedée sans `mvn`.
- [x] **Envoyer la liste des 5 statuts à Julien** (Adam, non-code) — **fait**. Reste : retour Julien pour l'ordonner/valider → fige le mapping Google Sheet (n8n côté Corentin).
- [x] **Création client — formulaire v0** — spec [[client-creation-form]], commit `4f95260` (branche `feat/client-creation-form`, pas encore PR). 5 champs requis, contact commercial persisté (`primary_contact_*`), `Europe/Paris` forcé, lien rep absolu copiable par ligne client, doublon email = `window.confirm`. `routingMode` plus envoyé par l'UI (cleanup colonne = TODO séparé ci-dessous). Tests backend 217/217 + web 34/34 + build verts.
- [ ] **Google Sheets — sync bidirectionnelle** (débloquée, [schéma fourni](https://docs.google.com/spreadsheets/d/1nom9ywiN7NFhVGUPZZ15ZWcqlkIR66D2xTsdZ8vbV0Q/edit))  → verify: statut Sheet → tâche reposition ; tâche faite → push retour Sheet
  - source de vérité = Google Sheet · contrat de statuts app = `docs/status-contract.md` (Julien type son Sheet dessus, n8n mappe) · pont Sheet↔Pipedrive via leur n8n (Hostinger) · coordonner avec **Corentin**

### Repositionnement
- [ ] Pop-up tâches de repositionnement à la connexion (1×/session, session 5h) + notifications **admin ET caller**  → verify: popup au login, liste "x clients à repositionner"
- [ ] Assignation manuelle ET auto via Google Sheet — auto = toujours réassigner au **même caller**

### Frontend restant
- [x] **F3 — Calendrier semaine sur `@schedule-x/react` v4** (3 surfaces : caller, agenda admin, picker reposition). Wrapper unique `ScheduleXWeek` + helpers purs `lib/schedule-x.ts` (testés). Fenêtre booking 12→260 sem. (avant + plancher semaine courante côté caller/reposition ; pas de plancher côté admin). Stratégie 30 min + buffer 15 min **inchangée** (100 % serveur). Backend 215/215 + web 40/40 + build verts.
- [x] **F4a — Badge provider Google/Microsoft sur connexions rep** — [PR #9](https://github.com/aramz33/BeeNice-Calendar/pull/9). Colonne **additive** `provider_vendor` (le champ `provider` reste « nylas »/« mock » car `isConnected` en dépend) ; persistée depuis `state.provider` au callback Nylas ; remontée `fromConnectionRow → upsertConnection → decorateRep → types.ts → ProviderVendorBadge` dans `AdminConnectionsPage`. Vendors seedés pour que les cartes mock affichent aussi un badge. **À vérifier en live (nylas)** : après connexion réelle Google/MS, la carte rep montre le bon badge.
- [ ] F4b — Bonus timezone côté caller/prospect : permettre au caller de voir les disponibilités depuis le fuseau du prospect appelé  → verify: affichage créneaux lisible dans timezone choisie, sans changer timezone client (`Europe/Paris`)
- [ ] F4c — Assignation tâche de repositionnement depuis vue admin (depends B4 ✅)
- [x] **Étendre la fenêtre agenda admin** — PR #12 (`bf2dc9b`). Découverte au grilling : l'availability serveur était hardcodée 09-18, donc élargir *seulement* la vue admin = cosmétique. Élargissement de bout en bout : `availability.mjs` → créneaux **08-20** ; `ScheduleXWeek` prop `dayBoundaries` (défaut 08-20, hérité caller+picker) ; agenda admin override **07-21**. ⚠️ amplitude 08-20 à valider par Julien ; ⚠️ bug TZ locale serveur noté en Resume. (Les « bugs UI mineurs notés en démo » restants ne sont pas couverts par cette PR.)
- [x] **Fix prefill reposition** — PR #12 (`bf2dc9b`). La tâche transporte désormais `prospect_email` (`tasks.mjs`) ; `handleTaskSelect` splitte `prospectName` → prénom/nom + remplit l'email. Pas de plomberie first/last structurée (seed les laisse NULL, split équivalent sauf prénom composé). Test backend ajouté.
- [ ] **Auto-email lien connexion rep à la création client** (optionnel) — mail typé au manager du client avec le lien `/connect/:token`  → verify: créer un client envoie le mail au contact
- [ ] F5 — Affichage statut RSVP dans détail booking (depends B5 ✅)
- [ ] **Édition contact client** dans `/admin/settings`  → verify: modifier prénom/nom/tel/email d'un client existant
- [ ] **Logo dans l'onglet (favicon)** : remplacer le favicon par le vrai logo BeeNice  → verify: l'onglet du navigateur affiche le logo BeeNice
- [ ] **Admin accède aussi à la vue caller** : le rôle admin a l'app complète — agir comme admin (vue admin + settings) **et** comme caller (vue caller normale).  → verify: connecté en admin, un lien/bascule mène à `/caller` et le booking y fonctionne
  - état actuel : `/caller` est déjà sous `RequireAuth` (pas `RequireAdmin`) donc la route s'affiche pour un admin ; gaps réels = (1) pas de lien vers la vue caller dans `AppChrome` quand `role === "admin"`, (2) `RootRedirect` envoie l'admin vers `/admin/bookings` (garder, mais ajouter l'accès), (3) vérifier que `/api/caller/*` (guardé `requireAuth`) répond bien pour le rôle admin — sinon élargir le guard.

### Livraison / déploiement
- [ ] **Sécu avant VPS** : `BETTER_AUTH_SECRET` — remplacer le fallback hardcodé de `auth.mjs` par un fail-fast au démarrage + provisionner la var (`openssl rand -base64 32`)  → verify: serveur refuse de démarrer sans la var → détail [[beeniceapp-auth-secret-fallback]]
- [ ] **Cleanup routingMode** : retirer/déprécier la colonne/API `routingMode` devenue inutile après routing %  → verify: plus aucune UI/API métier n'en dépend, migration sans casse des données existantes
  - pour l'implémentation formulaire client, ne pas exposer/envoyer `routingMode`; le backend peut ignorer un payload legacy en attendant ce cleanup
- [ ] **Cleanup cluster routing legacy** (suite du drop `rep.seniority`) : retirer le moteur de routing mort restant — `routing_mode = "weighted_seniority"`, `seniorityPool` (`availability.mjs`, toujours `"all"`), table `routing_policies`, et `AssignmentReason.chosenRole`/`roleDeficits`  → verify: routing % seul actif, lecture des bookings historiques (assignmentReason JSON legacy) toujours tolérée
  - ⚠️ `chosenRole`/`roleDeficits`/`seniorityPool` sont sérialisés dans l'historique des bookings → garder la lecture tolérante, ne pas casser les anciennes lignes. Cleanup séparé du drop `seniority` (fait dans `feat/client-creation-form`).
- [ ] Coordonner avec **Corentin** le format de packaging (conteneur) — impacte l'organisation du code
- [ ] T6 — `docs/DEPLOIEMENT.md` (déploiement VPS Hostinger)
- [ ] T3 — Filtre semaine dans liste admin (frontend seul, backend prêt)
- [ ] T5 — Extraire `withTempStore` + `createProviderStub` → `test-helpers.mjs`
- [ ] T7 — Documentation fonctionnelle + technique + session de formation

### Microsoft Azure (chemin critique client Cozy RH)
- [ ] **Julien fait remonter à l'IT de Cozy RH la demande de consentement admin** pour l'app BeeNice Calendar (Adam n'a pas de contact Cozy direct). Brief + mail prêts → [[brief-julien-auth-prod]] · [[nylas-microsoft-oauth/08 - Gerer le consentement admin client]]  → verify: admin Cozy a cliqué accepter
  - **Vérifié (sources MS Learn)** : le **consentement admin SEUL suffit** pour faire marcher Cozy RH — la vérification éditeur n'est PAS requise pour ça. Permissions demandées = `openid profile User.Read offline_access Calendars.ReadWrite` (+ `Calendars.ReadWrite.Shared` optionnel). Rien d'autre.
- [ ] **Vérification éditeur Microsoft (publisher verification)** — *gratuite*, recommandée avant de scaler (sans elle un rep ne peut pas s'auto-consentir → tout client doit passer par son admin ; + avertissement « éditeur non vérifié »). Pré-requis à valider : app Azure dans un **tenant pro BeeNice** (pas compte perso) + **domaine BeeNice** (pas `*.onmicrosoft.com`).  → verify: badge bleu « Vérifié » sur le consent screen
- [→] Tester l'auth Microsoft avec Cozy RH dès que l'IT a accordé les droits → [[microsoft-enterprise-auth]]

### Google OAuth production (pas bloquant juillet — Cozy = Microsoft)
- [ ] **Publier + faire vérifier l'app Google** (scopes calendrier = *sensibles* → vérification requise, mais **pas de CASA** payant). Guide complet → `docs/google-oauth-production-setup.md`. Sans ça : mode test = déconnexion tous les 7 j + plafond 100 users.  → verify: plus d'avertissement « app non vérifiée »
  - **À demander à BeeNice** (via [[brief-julien-auth-prod]]) : URL site + **page politique de confidentialité** (point lent, juridique) + **accès DNS → Corentin** (1 enreg. TXT) + logo/email support. Reste = Adam (config + soumission + vidéo démo).

### Actions Adam (non-code)
- [ ] Obtenir le SIRET → envoyer devis + facture acompte 30 %
- [x] **Envoyer les 2 docs prod-auth** (un Microsoft, un Google) à Julien/Camille — **fait**. Étapes côté BeeNice (consentement admin MS ; site + logo + politique de confidentialité + DNS Corentin côté Google).
- [ ] **Évaluer le devis supplémentaire** pour tout **routing custom par client** (~65 €/h) — round-robin + sync bidirectionnelle Google Sheet déjà **inclus** au devis ; le custom par client est en plus (acté démo 25-06)
- [ ] Envoyer documentation Nylas (RGPD, sécurité) à Julien + caler RDV tarif volume
- [ ] Process : créer une ligne/ticket et taguer Julien pour toute question
- [ ] Accès séparés admin/caller — freelancers hors Clotilde/Florian sans accès complet par défaut

### Standby
- [→] Vue Client miroir — en pause, remplacée par Google Sheets dans un premier temps
