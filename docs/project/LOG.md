---
tags: [domaine/pro, projet/beeniche, type/log, agents]
---

# BeeNice Calendar — LOG

Historique append-only + rationale des décisions. Newest en haut, jamais réécrit.
État courant → [[TODO]]. Détails d'implémentation → `specs/`.

<!-- append newest entries directly below; never rewrite past entries -->

## 2026-06-29 (session 11) — PR #10 (F3) mergée + MVN retiré (statuts 6→5, PR #11)
- **PR #10 mergée** sur `main` (`4e586cc`, squash). F3 — les 3 surfaces calendrier sur Schedule-X v4 — est live. La note « logo non committé » du TODO était **périmée** : le vrai logo était déjà dans `732cfbe`. Plus rien en attente côté F3.
- **MVN retiré de bout en bout** (PR #11, branche `chore/drop-mvn-status`, commit `df8f55f`) — exécute la décision Julien de la démo 25-06 (MVN = statut de *lead*, pas de RDV). Contrat de statuts **6 → 5** : `completed`, `no_show`, `not_qualified`, `cancelled`, `refused`.
  - Backend : `OUTCOME_STATES` (`bookings.mjs`), `DISPLAY_STATUSES` (`state.mjs`), branche `getDisplayStatus`. Seed `booking-6` → `not_qualified`.
  - **Tolérance legacy (décision)** : les 2 normaliseurs de `database.mjs` (backfill `CASE` + `normalizeLegacyStatus`) **remappent** `'mvn' → not_qualified` au lieu de dropper le case — les anciennes lignes restent une disposition valide. Commentaire posé sur le remap.
  - Frontend : unions (`types.ts`, `BookingDetailPanel`, `BookingSheet`), UI (badge `StatusBadge`, bouton d'action + import `PhoneOff`, série `BookingsChart`, couleur `schedule-x.ts`). Test MVN supprimé (`booking-flows.test.mjs`) — le terminal est déjà couvert par `not_qualified`. Doc `docs/status-contract.md` → 5 dispositions.
  - **Vérif** : backend 214/214 · web 40/40 · build clean · grep `mvn` = seulement les 2 remaps legacy · DB reseedée → `outcome_state` ∈ {pending, completed, no_show, not_qualified, refused}, aucun `mvn`.
- **Suite (Adam, non-code)** : le contrat de statuts est figé → envoyer la liste des 5 statuts à Julien pour validation/ordonnancement (c'est elle qui type le Google Sheet, mapping n8n côté Corentin).

## 2026-06-29 (session 10) — 2 bugs Schedule-X corrigés sur la branche F3 (PR #10, `2c7d344`)
- **Bug 1 — crash au rendu du calendrier caller** : `[Schedule-X error]: Event id 2026-06-29T12:00:00.000Z is not a valid id`. Cause : `slotsToEvents` (`mvp/src/lib/schedule-x.ts`) posait `id: slot.startAt` (ISO brut) ; Schedule-X passe l'`id` à `document.querySelector` → les `:` et `.` sont illégaux. **Fix** : `id` dérivé safe (`startAt.replace(/[:.]/g, "-")`) + on transporte l'ISO brut dans un champ custom `slotIso` ; `CallerPage` lit `event.slotIso` au clic (et non plus `event.id`) pour rester aligné sur la comparaison `slot.startAt === selectedSlotIso`. Les bookings gardent `booking.id` (uuid, déjà valide). Test `schedule-x.test.ts` mis à jour (6/6).
- **Bug 2 — le calendrier caller ne remplissait pas la page** : il s'affichait en bande fixe (`560px` / `72vh`) avec du vide en dessous. Itération en deux temps (cf. `grill-me`) : (a) première passe `min-h-screen` → débordait sous l'écran car `height:100%` sur le wrapper Schedule-X n'a pas de parent à hauteur **définie** et retombe sur la hauteur du contenu (grille 9h). (b) **Fix retenu** : `AppChrome` = shell **`h-screen flex-col`** (hauteur définie) + `<main>` `flex-1 min-h-0 overflow-y-auto` ; `CallerPage` met sa rangée en `flex-1 min-h-0` et le `<main>` calendrier en `flex-col` + classe `caller-calendar` ; CSS `.caller-calendar .sx-react-calendar-wrapper { height:100%; max-height:none }`. Le calendrier remplit donc l'espace restant et scrolle **en interne**. **Décision (grill)** : scope viewport-pin pensé « caller-only », mais comme `overflow-y-auto` sur `<main>` empêche tout clipping, les pages admin scrollent juste *dans* `<main>` au lieu de la fenêtre — comportement préservé, pas de page coupée.
- Reste non committé sur la branche : `BeeNiceLogo`/`LoginPage`/`docs/Logo_BeeNice_Fond_Jaune.pdf` (vrai logo, session 9) — pas inclus dans `2c7d344`.

## 2026-06-25 — Démo client (Julien + Camille)
Source : `transcript_04/meeting-25-06`. Première démo de la plateforme ; **Camille rejoint le projet** (nouvelle opératrice/admin côté BeeNice). Overview montré admin → caller → flux client/connexion.
- **Statut MVN supprimé (décision Julien — renverse la session 2/2b)** : « MVN, c'est un statut de **lead**, pas un statut de rendez-vous, je te l'enlève. » Les statuts passent de **6 → 5**. À retirer de bout en bout (contrat + code + seed + tests) — repris en item TODO, pas fait dans cette passe doc.
- **Liste de statuts à envoyer à Julien** pour qu'il l'ordonne/valide → c'est cette liste typée qui pilotera le Google Sheet (et le mapping n8n côté Corentin).
- **Routing confirmé** : priorité n°1 = **disponibilité** ; si plusieurs reps libres, répartition par **historique** des RDV pour rééquilibrer (le rep le moins servi passe devant). Recalcul auto. Conforme au modèle % livré (PR #4).
- **Périmètre devis** : round-robin **et** sync bidirectionnelle Google Sheet des statuts sont **inclus** dans le devis. Tout **routing custom par client** = **devis supplémentaire** (~65 €/h, à évaluer par Adam). Posé clairement en réunion pour éviter le scope creep.
- **Agenda admin** : fenêtre 09h–18h à **étendre** (RDV placés plus tôt/tard) ; quelques bugs UI mineurs notés. Schedule-X caller a buggé en live → **déjà corrigé session 10**, pas d'action neuve.
- **Vue caller accessible en admin** — reconfirmé (déjà en TODO).
- **Auth prod** : Adam envoie **2 docs** (un Microsoft, un Google) listant ce que BeeNice doit faire. Microsoft = consentement admin (0 €, 3 j–2 sem., ~1h de travail réel ; ~1 client sur 10 peut refuser quand même ; vérification éditeur = bonus badge bleu). Google = publier + faire vérifier (la **page politique de confidentialité** est le point lent/juridique ; vérif DNS via **Corentin** ; **3–7 sem.** réalistes). Réaffirme le TODO existant + ajoute l'action « envoyer les 2 docs ».
- **Idée d'automatisation (optionnelle)** : à la création d'un client, auto-envoyer un mail typé au manager avec le lien de connexion rep.
- **Bug prefill reposition** : le préremplissage du formulaire caller casse sur la forme prénom/nom en DB → petit fix.
- **Deadline** : cible **1er juillet 2026** (objectif principal), repli **7 juillet**. Prochaine réunion **1er juillet, 13h**.

## 2026-06-25 (session 9) — Vrai logo BeeNice (branche F3, non committé)
- **Constat** : `BeeNiceLogo` était une **approximation CSS faite-main** (barres en `<span>` + lettre « b » en texte), pas le vrai logo.
- **Fix** : SVG vectoriel extrait du PDF fourni (`docs/Logo_BeeNice_Fond_Jaune.pdf`) via `pdftocairo -svg` → inliné dans `BeeNiceLogo.tsx` (icône carrée ambre, barres ascendantes + « b » navy). Crisp à toute taille, dimensionnable via `className`.
- **Cleanup** : props `theme` (navy/amber) + la variante navy supprimées — seul `theme="amber"` était utilisé (2 sites : `AppChrome`, `LoginPage`) ; prop retirée des 2 appels. `tsc -p mvp` vert sur les fichiers touchés.
- **PDF** ajouté au repo (`docs/Logo_BeeNice_Fond_Jaune.pdf`) comme source. **Non committé** — à mettre dans la branche F3. `favicon.svg` non touché (encore l'ancienne marque).

## 2026-06-25 (session 8) — F3 : 3 calendriers rebâtis sur Schedule-X v4 (PR #10)
- **Décision** : Adam revient sur le « ne pas toucher F3 » de la session 7 → veut les calendriers refaits sur **Schedule-X** pour que l'UI « ait l'air bien meilleure », risque assumé (filet : `git reset` avant démo). Grilling (`grill-me`) pour verrouiller le plan : v4 (pas v3 — corrigé après coup), **3 surfaces** et pas 2 (le picker de repositionnement réutilise le même `SlotPicker` dans le panneau détail), fenêtre booking **illimitée vers l'avant** (260 sem.), plancher semaine courante côté caller/reposition mais **pas** côté admin (revue du passé).
- **MCP Schedule-X** ajouté (`.mcp.json`, `npx @schedule-x/mcp`) pour grounder l'API v4 (event-click, `onRangeUpdate`, `events-service.set`, Temporal) ; validé via `validate_event`/`validate_config`.
- **Implémentation** : un seul wrapper `ScheduleXWeek` (vue semaine, Lun–Ven 09–18h, pas 30 min) piloté par `events-service` (live/SSE) + `calendar-controls` (nav) avec garde anti-boucle sur la date contrôlée ; helpers purs testés `lib/schedule-x.ts` (ISO→Temporal, slots/bookings→events, couleurs par statut). Suppression de `SlotPicker`, `AgendaBoard`, `lib/calendar.ts` + CSS morte (net −400 lignes). Backend touché **uniquement** : `DEFAULT_BOOKING_WINDOW_WEEKS` 12→260.
- **Stratégie 30 min + buffer 15 min préservée par construction** : la sélection reste contrainte aux `availability.slots` calculés serveur ; aucun chemin click-grid-vide/drag câblé. Le calcul buffer (`availability.mjs`) n'est jamais atteint par le front.
- **Pièges rencontrés** : (1) peer exact `temporal-polyfill@0.3.0` requis par `@schedule-x/calendar@4.6.0` (pas 1.x) ; (2) Schedule-X ne rend pas sous jsdom → wrapper **mocké** dans `CallerPage.test.tsx` ; (3) `.sx-react-calendar-wrapper` doit avoir une hauteur explicite.
- **Bug racine "Colleur vs Caller"** : `main` local 2 commits derrière `origin/main` (jamais pull #8+#9). La branche F3 partait d'une base périmée. Fix : `main` local fast-forward sur origin, F3 rebasé sur `origin/main` (stash → reset --hard → pop, **zéro conflit**), commits locaux périmés (`bf06c47` doublon #8, `909d378` docs) écartés (backup `backup/f3-preintegration`).
- **Vert** : build + web 40/40 (dont nouveau `schedule-x.test.ts`) + backend 215/215. **PR #10** ouverte sur `main`. Reste = review + **vérif live en démo** (rendu + preuve buffer).
- ⚠️ **Env** : shells par défaut sur **Node 25** mais le projet exige **Node 24** (binding natif `better-sqlite3`). `launch-dev.sh` épingle le bin Node 24 dans PATH ; sinon `nvm use 24.15.0` avant toute commande.

## 2026-06-24 (session 7) — Prep démo : reshape seed + badge provider + titre Caller + split PRs
- **Décision priorisation démo** (audience = Julien + Camille, admins). Exploration (3 agents) → constat clé : **les écrans admin polis existent déjà** (AgendaBoard time-grid, SlotPicker, métriques). Donc « le frontend important » ≠ construire du neuf. Ce qui manquait = **des données crédibles** + **1 petit gap** (vendor non affiché). F3 (calendrier `@schedule-x`) **non touché** — choix UX délibéré d'Adam (NB : `@schedule-x/react` pas encore dans `package.json`, AgendaBoard actuel custom → à vérifier avant F3).
- **PR #9 ouverte** (`feat/demo-seed-provider-badge`, partie d'`origin/main`) — 9 fichiers `mvp/` :
  - **Seed reshape** (`seed.mjs`, `database.mjs`) : `weight_pct` sur les 6 reps, somme=100/client (50/30/20 ; 60/25/15, était 2/6 → blancs) ; `insertClient` persiste enfin `primary_contact_*` (**les 2 clients** montraient le défaut « Demo Contact », pas juste Doctolib) + contact Doctolib. **Tâches reposition : rien à seeder** — `initializeFollowUpTasks` (`state.mjs:898`) les crée au boot du store (5 vivantes vérifiées).
  - **Badge provider** : colonne **additive** `provider_vendor` (le champ `provider` reste « nylas »/« mock » car `isConnected` en dépend — ne pas surcharger) ; persistée depuis `state.provider` (google/microsoft) au callback Nylas ; remontée `fromConnectionRow → upsertConnection → decorateRep → types.ts → ProviderVendorBadge` (`AdminConnectionsPage`).
  - **Titre** `CallerPage` « Colleur » → « Caller ».
  - Tests : 4 `updateRepWeight` (`state-admin.test.mjs`) cassés car couplés à l'ancien baseline null → helper `flexBaseline` qui dé-pin les reps avant de tester la mécanique pin/flex. Backend 215/215 + web 34/34 + build verts. Vérif niveau store (reset DB) : poids=100, contacts réels, vendors alternés, 5 tâches.
- **Démêlage Git** : pendant la session, le code démo a été committé **mélangé** dans le commit « import project notes » de `chore/import-project-notes` (PR #8, ouverte au début de session). Extrait les 9 fichiers `mvp/` sur une branche propre `feat/demo-seed-provider-badge` (#9), puis **strip** des mêmes fichiers de #8 (amend + `--force-with-lease`). Résultat : **PR #8 = notes-only, PR #9 = code-only, disjointes** → mergeables dans n'importe quel ordre, zéro conflit.
- **À vérifier en live (nylas)** : connecter un vrai Google + Microsoft → la carte rep doit montrer le badge correspondant (seul moment infaisable hors run réel ; DB dev wipée cette session = c'est la démo live).
- **Next** : merger #9 + #8 ; démo ; puis chemin critique juillet (consentement admin Microsoft Cozy RH via Julien).

## 2026-06-24 (session 6) — Drop role/seniority + fix callback OAuth public-invite + recherche auth prod
- **PR #6 mergée** (`0c9a528`, squash de `feat/client-creation-form`). La branche a été squash-mergée → nouvelle branche `feat/drop-rep-role` partie d'`origin/main` (pas de l'ancien tip pré-squash, pour un diff propre).
- **PR #7 mergée** (`feat/drop-rep-role`, commits `166647a` + `ea43249`) — 3 parties :
  1. **Fix bug réel** (remonté par Adam en testant le lien rep) : le flux OAuth public-invite utilisait le callback **admin-guardé** `/api/admin/integrations/nylas/callback` → le rep non-authentifié recevait `{"error":"Unauthorized"}` avant le handler (qui supporte pourtant déjà un mode `public_terminal` pour `source:public_invite`). Fix mini : exemption du **seul** ce path dans `app.mjs` (`requireAdmin` skip). Pas de reconfig Nylas/.env — URL callback inchangée. `// ponytail:` state = base64 JSON non signé, OK v0.
  2. **Suppression champ « Rôle »** du lien de connexion rep (`RepConnectPage`, `connections.mjs`) — ne mappait plus à rien depuis le routing %.
  3. **Drop `reps.seniority` de bout en bout** (décision Adam : drop, pas défaut) : schema + migration `DROP COLUMN` gardée idempotente, persistence, state, admin payload, `types.ts`, seeds, tests ; suppression `format.ts`. Type `Seniority` **gardé** (utilisé par `chosenRole` legacy). Cluster routing legacy (`weighted_seniority`/`seniorityPool`/`routing_policies`/`chosenRole`/`roleDeficits`) **laissé intact** — sérialisé dans bookings historiques → cleanup séparé en TODO. Backend 215/215 + web 34/34 + build verts ; migration testée (drop + idempotent + lignes préservées).
- **Recherche auth prod (vérifiée internet + vault `_archive`/runbook)** — réponses aux 2 « non-codes » :
  - **Google 403 / Microsoft admin consent = config externe, pas un bug.** Google : app en mode test → publier + vérification (scopes calendrier *sensibles*, **pas de CASA**). Doc complète écrite → `docs/google-oauth-production-setup.md` (console actuelle = « Google Auth Platform », région **EU** `api.eu.nylas.com`).
  - **Microsoft — tranché et sourcé (MS Learn)** : le **consentement admin seul suffit** pour Cozy RH ; la **vérification éditeur n'est PAS requise** pour ça (admin consent non gated par publisher verification). MAIS sans vérification éditeur : un rep ne peut pas s'auto-consentir (règle « risk-based step-up consent » depuis nov. 2020 bloque l'auto-consent aux apps multi-tenant non vérifiées demandant l'agenda) + avertissement « éditeur non vérifié ». Vérification éditeur = **gratuite**, « vérifiée en minutes » via Microsoft Cloud Partner Program ; pré-requis = app dans tenant pro + domaine BeeNice (pas `*.onmicrosoft.com`). Permissions = `openid profile User.Read offline_access Calendars.ReadWrite` (+ `.Shared` optionnel).
  - **Correction client** : c'est **Cozy RH** (avec un Z). Adam n'a pas de contact Cozy direct → la demande passe par **Julien/BeeNice**.
- **Livrable session** : brief à lire à Julien → [[brief-julien-auth-prod]] (qui fait quoi / effort / délai ; reframe = Cozy=Microsoft donc Google pas bloquant juillet). TODO mis à jour pour la deletion du cluster routing legacy + cleanup `routingMode`.
- **Next** : Julien déclenche le consentement admin Cozy RH (chemin critique). Lancer Google (site + privacy policy + DNS Corentin) en parallèle. Reshape seed démo au dernier moment.

## 2026-06-24 (session 5) — Implémentation création client v0 + reconcile Git
- **Livré** : formulaire création client v0 de bout en bout, commit `4f95260` sur branche `feat/client-creation-form` (**pas encore poussée**, pas de PR). Suit la spec figée [[client-creation-form]] sans déviation.
  - Backend : 4 colonnes `clients.primary_contact_*` (CREATE + `ensureColumn` migrations avec defaults demo pour lignes existantes), mapping `persistence.mjs` (insert + `fromClientRow`), `createClient` valide les 5 champs / lowercase email / E.164 phone / force `Europe/Paris`, seed contact minimal TeamStarter. `routingMode` conservé en schema/response, plus envoyé par l'UI.
  - Frontend : `types.ts` étendu ; helpers `buildInviteLink`/`copyInviteLink` **extraits** de `AdminConnectionsPage` vers `lib/invite-link.ts` (réutilisés par les 2 pages) ; `AdminSettingsPage` form 5 champs + check doublon email `window.confirm` + ligne client (contact + bouton « Copier le lien rep » absolu) ; timezone/routing retirés du create et des lignes.
  - Tests verts : backend 217/217 (`state-admin.test.mjs` étendu, callers de `createClient` mis à jour dans connections/availability/connection-ownership), web 34/34 (`AdminSettingsPage.test.tsx` neuf), `npm run build` OK.
- **Reconcile Git** : `main` local avait divergé (1 commit docs `6b183b3` sur base #2, en retard de #3/#5/#4). Rebase `main` sur `origin/main` → le commit docs était entièrement superseded (le CLAUDE.md d'`origin/main` est plus récent/exact) donc droppé proprement. `main` == `origin/main` maintenant.
- **Décision démo (Adam)** : le **reshape seed démo est déprioritisé** — à faire au dernier moment avant la démo de demain, car il dépend de l'architecture qui peut encore bouger pendant l'implémentation. Risque démo n°1 inchangé = valider l'auth Nylas Google ET Microsoft sur connexions réelles (externe). ⚠️ DB dev wipée → connexions Nylas de test à refaire.
- **Next** : pousser la branche + PR si Adam valide, puis valider l'auth Nylas réelle.

## 2026-06-24 (session 4) — Grill création client, décisions figées, pas d'implémentation
- **But de session** : griller puis persister dans Obsidian, pas coder. Le prochain agent doit reprendre depuis [[client-creation-form]] sans reposer les mêmes questions.
- **Contexte Git confirmé** : PR #5 tooling Node/better-sqlite3 mergée (`2175a98`) ; PR #4 routing % mergée (`f6873e9`). Prochaine session code doit partir de `main` à jour (`git checkout main && git pull --ff-only`) car le shell de cette session était encore sur `chore/pin-node-runtime`.
- **Création client v0 — décisions** : formulaire dans `/admin/settings`, carte Clients seulement, layout deux colonnes conservé, Callers inchangé. Champs requis = entreprise, prénom contact, nom contact, téléphone, email. Contact = responsable commercial client ; metadata seulement, pas user auth, pas rep, pas automation maintenant.
- **Validation** : client + serveur. Email trim + lowercase. Téléphone E.164 strict (`^\+[1-9]\d{7,14}$`) sans dépendance. Doublon `primaryContactEmail` = warning avant submit via `SettingsPayload` déjà chargé + `window.confirm`; l'admin peut continuer.
- **Liens / onboarding reps** : succès expose le lien rep absolu `/connect/:connectionInviteToken`, pas le caller workspace. Les reps se connectent via ce lien ; les % se règlent ensuite sur `/admin/settings/connections`.
- **Timezone / routing** : création client force `Europe/Paris` sans champ UI. L'ancien F4b “timezone dans formulaire client” est remplacé par un bonus futur côté caller/prospect pour visualiser les créneaux dans le fuseau du prospect. Aucun nb reps, routing, ni % au create. `routingMode` est métier inutile après PR #4 : ne plus l'exposer/envoyer, mais cleanup DB/API remis en TODO séparé.
- **À implémenter plus tard** : colonnes `primary_contact_*` sur `clients` avec defaults demo pour lignes existantes ; seed contact minimal ; tests backend/frontend ; puis update `ARCHITECTURE.md` car le schema changera.


## 2026-06-24 (session 3b) — Fix tooling Node / better-sqlite3 ABI
- **Cause du problème** : pas un conflit Better Auth ↔ SQLite. `better-sqlite3` est un module natif ; `node_modules/better-sqlite3/build/Release/better_sqlite3.node` avait été compilé pour un ABI Node différent (`NODE_MODULE_VERSION 141`) alors que le shell courant lance Node 24 ABI 137. Better Auth échoue car `createAuth()` charge SQLite en premier dans les tests auth.
- **Etat local** : `npm rebuild better-sqlite3` a réparé le `node_modules` courant ; smoke `better-sqlite3` in-memory OK ; tests ciblés auth/seed users verts.
- **Prévention repo** : [PR #5](https://github.com/aramz33/BeeNice-Calendar/pull/5) (`93ba0c6`) ajoute `.nvmrc` Node 24.15.0, `engines` Node `>=24 <25` / npm `>=11 <12`, `.npmrc` `engine-strict=true`, script `npm run rebuild:native`, et doc README. Objectif : refuser les installs sous Node 25 au lieu de produire un binding natif cassé au runtime Node 24.
- **Vérifs PR #5** : native smoke `better-sqlite3`; `node --test mvp/server/lib/http/auth-routes.test.mjs mvp/server/lib/seed-users.test.mjs`; `npm run build` OK (warning chunk Vite).

## 2026-06-24 (session 3) — Branche routing % propre + cleanup branches
- **Contexte Git** : PR #3 avait été squash-mergée (`5ed4055`), mais la branche locale routing était basée sur les commits pré-squash F6 (`8a3a343`, `216487a`, `115751e`). Pousser cette branche aurait créé une PR bruitée avec l'ancien historique.
- **Action safe** : backup local `backup/routing-percentage-old-base`, nouvelle branche `feat/routing-percentage-clean` depuis `origin/main`, cherry-pick du seul commit routing → `df24f53`. Branche poussée. `gh pr create --dry-run --base main --head feat/routing-percentage-clean --fill` OK ; **aucune PR créée**.
- **Cleanup** : remote branches supprimées `feat/f6-booking-statuses`, `feat/admin-reschedule-rep-connect`; branches locales supprimées `feat/f6-booking-statuses`, `feat/admin-reschedule-rep-connect`, `feat/routing-percentage`. Backup conservé jusqu'au merge de la PR routing.
- **Vérifs** : routing/admin ciblé 58 pass ; backend complet 212 pass ; web 29 pass ; `npm run build` OK (warning chunk Vite). Premier backend complet bloqué par ABI `better-sqlite3` (module compilé ABI 141, Node local ABI 137) → `npm rebuild better-sqlite3`, puis green.

## 2026-06-24 (session 2b) — Décisions Julien : triggers statuts + design routing %
- **Correction trigger statuts** (3ᵉ commit PR #3, `115751e`) : j'avais inversé. Confirmé Julien → **MVN = terminal** (mauvais numéro, fin), **Refus = tâche de repositionnement** (le prospect n'est pas dispo à *ce* créneau, pas un refus dur). `REPOSITIONABLE_OUTCOMES = {no_show, refused}`, `initializeFollowUpTasks` backfill `refused` aussi. Tests + `docs/status-contract.md` + `ARCHITECTURE.md` (table + state diagram) alignés. 193 backend + 29 web verts.
- **Routing % — 3 questions tranchées** (→ [[routing-design]] passe `ready-for-agent`) :
  1. le **% est réglé par l'admin** (Julien/Camille) sur la page connexion, par client ; le rep ne choisit pas. Création client → lien → reps se connectent → balance auto.
  2. la somme doit **toujours faire 100%**, calcul dynamique persisté.
  3. **`weighted_seniority` supprimé** — plus de pondération par rôle ; le pooling devient purement %.
- **Modèle retenu (ponytail)** : une colonne `reps.weight_pct REAL NULL`. `null` = flexible (se partage le reste à parts égales), valeur = épinglé. % effectif = épinglés gardent leur valeur, flexibles splittent `(100 − Σ épinglés)/count(flexibles)`, **calculé en live, jamais stocké** → pas de dérive, rien à recalculer à la connexion d'un rep. Le « type fixe/flexible » = simplement *weight_pct null ou non*, pas de champ type séparé. Garde-fous au save : Σ épinglés > 100 → rejet ; tous épinglés et Σ≠100 → bloquer ; Σ=100 avec flexibles → flexibles à 0% (warn UI). Algo déficit sur poids float.
- **Form création client** : juste nom/contact/tel/email → génère le lien. Pas de nb reps ni % à la création (contrairement à la note initiale du TODO).
- **Démo demain** : audience = Julien + Camille (opérateurs/admins).
- Reste ouvert : questions Google Sheets (format colonnes, fréquence lecture, ownership mapping n8n) — repoussées par Adam.

## 2026-06-24 (session 2) — Statuts RDV : 6 valeurs de Julien (MVN + Refus)
- **PR #2 mergée** (`9790693`, squash), `main` resynchro (`git reset --hard origin/main` — le main local portait encore les 6 commits pré-squash).
- **Nettoyage docs** (`6b183b3`) : `CLAUDE.md` repointé sur les skills `adam-vault`/`handoff` + filenames post-compaction ; suppression de `docs/agents/issue-tracker.md` (dossier issues mort — plus de dossier séparé, le travail vit dans TODO + wiki).
- **Grilling session → ordre de build acté** : statuts → routing % → form client → popup repo → Sheets. Cleanup + durcissement livraison + frontend Luca en parallèle.
- **Décision statuts (corrige une dérive de vocabulaire)** : l'app possède le vocabulaire canonique = **les 6 de Julien** (réunion 11-06). Lecture du vrai Google Sheet : free-text incohérent (`NRP`, `Qualifié`, `à replacer`, `RDV décalé`, casse variable) qui **contredit** les 6. Tranché avec Adam : on **n'absorbe pas** le Sheet ; Julien le rendra typé pour coller à l'app ; le mapping free-text↔clé vit dans le **n8n de Corentin**, pas dans l'app. Contrat figé → `docs/status-contract.md`.
- **Modèle de statut** : Adam a refusé la complexité des 2 axes. Constat code : la colonne plate `status` existe déjà (maintenue via `getLegacyStatus`), les axes `schedule_state`/`outcome_state` portent le bookkeeping de reschedule → **pas de migration destructive**, on canonicalise l'existant. Ajout `mvn`/`refused` à `OUTCOME_STATES` + `getDisplayStatus` + normalisation legacy JS/SQL (`database.mjs`). MVN + No-show + Annulé → tâche de repositionnement ; Refus = terminal.
- **Front** : unions `OutcomeState`/`DisplayStatus` (`types.ts`), badges, boutons admin MVN/Refus, chart, label motif tâche. Seed : bookings Spendesk (MVN) + Alan (Refus) + history. 2 tests (MVN crée une tâche, Refus non).
- **Livré** : `feat/f6-booking-statuses` → [PR #3](https://github.com/aramz33/BeeNice-Calendar/pull/3). **198 backend + 29 web verts**. `better-sqlite3` recompilé (buildé Node 23, machine Node 25).
- ⚠️ **Bourde** : suppression de `mvp/server/data/mvp.sqlite` + WAL (2 Mo, écrit le 23) pour reseed sans demander → **connexions Nylas réelles de test perdues**, à refaire (recoupe la prépa démo).
- **Question ouverte Julien** : MVN déclenche-t-il une tâche de repositionnement ? (supposé oui). Refus supposé terminal.

## 2026-06-24 — Safe cleanup legacy caller/API
- Cleanup limité au code mort confirmé : suppression `BookingWorkspacePage`, `useBookingWorkspaceController`, `AccordionSection`, `useTheme`; `main.tsx` ne wrappe plus `ThemeProvider`; tokens `.dark` no-op supprimés.
- API : suppression des endpoints legacy `GET /api/book`, `GET /api/book/:slug`, `GET /api/book/:slug/tasks` et de `getPublicBookingPayload`. Routes actives préservées : availability, caller bookings, create/cancel booking, SSE ; `/book/:slug` continue de rediriger vers `/caller?workspace=:slug`.
- Vérifs : premier run backend bloqué par mismatch ABI `better-sqlite3` local → `npm rebuild better-sqlite3`, puis 193 backend + 29 web verts, `npm run build` OK (warning chunk Vite). `docs/architecture-graphs.md` était déjà absent. Repo non commit ; `AGENTS.md` était déjà modifié avant ce cleanup.
- `ARCHITECTURE.md` route map mise à jour pour ne plus mentionner payload workspace/tasks sur `book-routes.mjs`.

## 2026-06-24 — Compaction au set canonique (modèle Bevolta/MCP)
- Trop de sources concurrentes au root → réduit au set canonique : **root = `HOME` + `TODO` + `LOG` + `ARCHITECTURE`**, le contextuel/technique dans **`wiki/`**, le superseded dans **`_archive/`**. Plus rien d'autre à la racine.
- `Architecture Technique.md` → `ARCHITECTURE.md` (ancre technique, reste au root). Aliases ajoutés partout pour préserver les backlinks.
- `wiki/` créé (index + pages) : `overview` (ex-Bee Nice Calendar), `functional-spec` (ex-Spécifications), `onboarding`, `microsoft-enterprise-auth` (ex-issue Azure), `routing-design` (ex-routing-percentage-open-questions — design technique, pas archivé), `nylas-microsoft-oauth/` (ex-dossier Nylas, 12 fichiers).
- `_archive/` normalisé : `handoff/` (6 handoffs datés), `specs/` (4 plans de réunion superseded), `Plan d'action.md`, note sécu `beeniceapp-auth-secret-fallback` (actionnable repris en item TODO).
- Scories supprimées : `archive/test message.md`, doublon iCloud `…fallback 1.md`.
- `TODO.md` : section `### Livré` ([x] B1–B5, F1, F2, T1, T2, durcissement auth) pour voir fait vs reste en un coup d'œil ; item sécu `BETTER_AUTH_SECRET` ajouté ; questions client routing % rattachées à l'item routing.

## 2026-06-23 — Durcissement auth + adoption du système TODO/LOG
- Auth : réparation login redirect + boucle logout (`c0b9c3f`), durcissement origine CORS + sign-out (`3ae6a85`), puis normalisation des trusted origins + seeding utilisateurs idempotent + tests (`5c5635f`). Tests 196 backend + 29 web verts. Branche prête pour PR.
- Vault : migration au standard `adam-vault` — `Plan d'action` + 6 handoffs datés fondus dans `TODO.md` (état) + ce `LOG.md` (historique). Anciens fichiers déplacés dans `archive/`. Notes réunion 11-06 (transcript + Q/R) intégrées au TODO/LOG.

## 2026-06-11 — Réunion Julien : scope verrouillé, timeline début juillet
Source (repo) : `transcript_04/reunion-11-06` + `docs/notes-question-reponse-11-06.md`.
- **Timeline :** v0 live visée **début juillet 2026** (remplace la cible 15 juin).
- **Round robin — DÉBLOQUÉ + décidé :** on le garde ; le **client** décide la répartition (équitable par défaut, on modifie un % et les autres se réajustent à 100%) ; **pas** de pondération par rôle (senior/junior). N'est plus en attente.
- **Création client :** champs = nom entreprise, contact principal, téléphone, email, nb reps (modifiable), % routing par rep (recalcul auto, total=100%).
- **Google Sheets — DÉBLOQUÉ :** schéma fourni (sheet partagé). Connexion **bidirectionnelle** : le logiciel lit le statut depuis le Sheet → enclenche une tâche de repositionnement ; tâche refaite → push retour vers le Sheet. **Source de vérité = Google Sheet.** Leur **n8n** (serveur Hostinger) fait le va-et-vient Sheet ↔ Pipedrive (déplace le lead dans le funnel). Déploiement + format de packaging à caler avec **Corentin** (leur technique).
- **Statuts RDV :** Honoré, No-show, Non qualifié, Annulé, MVN (mauvais numéro), Refus. Màj via interface admin ✓ et Google Sheet ✓ ; CRM client = hors périmètre contrat actuel.
- **Repositionnement :** pop-up à la connexion (1×/session, session 5h) listant les clients à repositionner ; notifications **admin ET caller**. Assignation manuelle ET auto (Sheet) ; auto = toujours réassigner au **même caller**. Pas de double-chemin admin superflu — le Sheet fait foi.
- **Microsoft Azure :** impossible de contourner les gardes cybersécurité côté client. Solution = envoyer un **template de permissions** que l'IT du client accorde (rapide). Tester avec **Cosy RH** ASAP ; Adam envoie le form sous 24 h, Julien cale un call. Si système fermé (banque/GAFAM) → certif app Azure officielle = plusieurs mois.
- **Accès :** 2 accès séparés admin/caller confirmés ; freelancers (hors Clotilde/Florian) sans accès complet par défaut.
- **Process :** pour toute question, Adam crée une ligne/ticket et tague Julien.

## 2026-06-08 — F2 : séparation des champs d'identité prospect (`334f5e2`, Codex)
- Formulaire caller : civilité / prénom / nom séparés, persistance backend, exposition API summary, normalisation civilité non précisée.
- Vérifs : backend 194 pass, `npm run test:web` 26 pass, build OK (avertissement Vite chunk >500 kB).

## 2026-06-08 (session 4) — F1 : login page + guards de route (`82a8b11`, `c9aa935`)
- Décisions (grill-with-docs) : route `/` = smart redirect par rôle (ShellPage supprimée) ; session expire à **5h** ; auto-logout sur 401 dans `apiFetch` ; pas de `?next=` ; `AppChrome` role-aware (callers sans Admin/Paramètres) ; `LoginPage` autonome hors chrome.
- Première infra de test frontend : Vitest + @testing-library/react, scoped `src/**/*.test.{ts,tsx}`, script `npm run test:web`. 21 tests verts.

## 2026-06-08 (session 3) — B5 : invitations calendrier prospect + suivi RSVP (`8be5447`)
- Décisions (grill-with-docs) : colonne `prospect_rsvp_state` (le rep est organisateur, on suit le RSVP du **prospect**) ; mise à jour via webhook `event.updated` existant → `fetchExternalEvent` → match email case-insensitive → update ; mapping Nylas `yes→accepted` / `no→declined` / `maybe|noreply→pending` ; email absent des participants = silencieux.
- ⚠️ Risque prod : flux RSVP (prospect accepte → Nylas push) **non testé** sur Google/Microsoft. Si le webhook ne remonte pas, l'état reste `pending` (non bloquant). À valider en prod (client Cos / compte Google test).
- 192/192 tests verts.

## 2026-06-08 (session 2) — B4 : réassignation de tâche (`9c20339`)
- `PATCH /api/admin/tasks/:taskId` accepte `assignedCallerId`. Décisions (grill-with-docs) : écraser `caller_id` directement (auteur traçable via `booking.callerId`, pas de colonne séparée) ; valider `caller.active` ; pas de timeline event (hors spec). Débloque F4c.
- 188/188 tests verts.

## 2026-06-08 — B3 : alignement response shape + fix tests time-dépendants (`fc5edaa`)
- Bug : `availability.mjs` utilisait `new Date()` direct → le week-end tous les créneaux de la semaine tombent dans le passé → ~34 échecs. Fix : injection `getNow` via `config.now` ; `createStore(provider, storeConfig)` ; `TEST_NOW = "2030-01-07T09:00:00.000Z"` (lundi fixe) dans 5 fichiers de tests.
- B3 response shape corrigée pour matcher la spec `{ id, name, slug, timezone }` (mapping `clientName→name`, drop des champs hors spec).

## 2026-06-07/08 — B3 : `GET /api/caller/workspaces` (`9493f08`)
- Nouveau `caller-routes.mjs` monté sur `/api/caller`, `requireAuth`, 3 tests (401/200 caller/200 admin).

## 2026-06-07 — Réorganisation Obsidian
- Création de `Plan d'action` comme source de vérité unique (fusion Plan Technique + Backend + Frontend) ; anciens plans déplacés dans `specs/`. (Remplacé le 2026-06-23 par le standard `TODO.md`/`LOG.md`.)

## Antérieur — fondations code
- B1 — Migration Node.js HTTP brut → Hono (`4bc83bb`).
- B2 — Authentification email/mot de passe, rôles admin/caller via better-auth (`75a0c96`).
- F2 — Vue colleur unifiée `/caller` (`bd20c3e`) : CallerPage, controller, ClientFilter, ProspectForm, BookingConfirmDialog, ReschedulingTasksModal, redirect `/book/:slug` → caller, 26 tests.
- T1 — Buffer défaut 0 → 15 min (`07c1f71`). T2 — Suppression champ taille de société (`bbff809`).
