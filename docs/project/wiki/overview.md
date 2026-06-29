---
tags: [domaine/pro, projet/beeniche, type/note, statut/actif, agents]
aliases: [Bee Nice Calendar]
---

# BeeNice Calendar

> Outil de prise de RDV B2B pour BeeNice (agence de prospection commerciale).
> Remplace le Google Sheets actuel. Permet aux colleurs (SDRs BeeNice) de booker des créneaux dans les calendriers des commerciaux (reps) de leurs clients.

**Client :** BeeNice
**Contacts :** Julien BOUIC, Camille Six (absente ponctuellement), Florian Caillet
**Stack :** React 18 + React Router 7 + Tailwind CSS 4 + Radix UI (frontend) · Hono + Node.js + SQLite (DatabaseSync) + better-auth (backend) · Nylas (provider calendrier)
**Repo :** [aramz33/BeeNice-Calendar](https://github.com/aramz33/BeeNice-Calendar)
**Dernière réunion :** 27 avril 2026
**Statut :** Démo validée — en attente acompte 30 % (SIRET en cours)

---

## Contexte produit

L'app structure les RDV de prospection en 3 rôles :
- **Admin (BeeNice)** — supervise tout, crée les workspaces clients, gère les statuts
- **Colleur** — SDR BeeNice qui prend les RDV pour le compte des reps clients
- **Rep** — commercial client dont le calendrier est connecté (Google ou Microsoft)

Un *booking link* a un slug (ex: `teamstarter-discovery`) et appartient à un client.
Le routing est pondéré : round robin avec pourcentages définis par client (ex: 10/10/40/40).
La disponibilité est calculée en live depuis les connexions calendrier + bookings existants + buffer.

### Clients actifs (5-6 clients, 1 à 5 calendriers par client)
- DJ Format — 5 reps
- Team Starter — 2-3 reps
- Cos — 1 rep (Microsoft — client test prioritaire)
- The Blue — 1 rep
- Akmé — 1 rep
- Kepler — 1 rep

---

## Fonctionnalités — état au 2026-06-08 (session 4)

### ✅ Implémenté et validé
- Workspace colleur avec disponibilités live consolidées (via Nylas mock)
- Prise de RDV 30 min avec infos prospect (nom, email, entreprise, notes)
- Sync bidirectionnelle calendrier (modification Google → refresh app)
- Vue admin agrégée : tous les RDV, filtres par client / colleur / rep / statut
- Annulation et rebooking depuis le workspace colleur
- Replanification admin (choisir un nouveau créneau depuis la vue admin)
- Statuts RDV : honoré / annulé / repositionné / non qualifié
- Historique immutable (`booking_status_history`)
- Navigation hebdomadaire sur 12 semaines
- Ajout de nouveaux clients (workspace) depuis la vue paramètres
- Inscription des reps via lien dédié (Google OAuth opérationnel)
- Buffer 15 min avant/après chaque créneau (commit `07c1f71`)
- Champ "Taille de société" retiré du template par défaut (commit `bbff809`)
- Migration backend Node.js HTTP brut → Hono (commit `4bc83bb`)
- Authentification email/mot de passe via better-auth — rôles admin/caller, sessions cookie, routes protégées (commit `75a0c96`)
- `GET /api/caller/workspaces` — endpoint authentifié pour la vue colleur (commit `9493f08`)
- `PATCH /api/admin/tasks/:taskId` — réassignation colleur depuis l'admin (commit `9c20339`)
- Invitation calendrier prospect : `notify_participants=true` Nylas → prospect reçoit l'iCal (commit `8be5447`)
- Suivi RSVP prospect : colonne `prospect_rsvp_state` mise à jour via webhook `event.updated` (commit `8be5447`)
  - ⚠️ **À valider en prod** : flux webhook RSVP non testé sur Google ni Microsoft
- Login page + guards de route frontend (`82a8b11`) :
  - `LoginPage` autonome (email/password), redirect par rôle
  - `RequireAuth` / `RequireAdmin` layout guards (React Router v7)
  - `RootRedirect` remplace ShellPage — smart redirect par rôle
  - `AppChrome` role-aware : callers ne voient pas Admin/Paramètres + bouton Déconnexion
  - Session expiry 5h, auto-logout sur 401
- Infra tests frontend Vitest + @testing-library/react (`c9aa935`) — 21 tests, `npm run test:web`
- **F2 — Vue colleur unifiée** (`bd20c3e`) :
  - Route `/caller?workspace=:slug` — remplace `/book/:slug` pour les callers
  - `CallerPage` + `useCallerController` : workspaces, disponibilités, booking, SSE, tâches
  - Panel gauche : `ClientFilter` (dropdown workspaces) + `ProspectForm` + `ReschedulingTasksList`
  - `BookingConfirmDialog` (Radix Dialog) — confirmation lecture seule avant soumission
  - `ReschedulingTasksModal` — modal cross-workspace au 1er chargement de session (sessionStorage flag)
  - `/book/:slug` → redirect interne vers `/caller?workspace=:slug`
  - `TASKS_MODAL_SHOWN_KEY` + `sessionStorage.removeItem` dans `signOut()`
  - 26/26 tests frontend · 22/22 tests backend
- Smoke test API adapté à l'auth session cookie — 9/9 checks (`admin` + `caller`)
- **Bugfixes better-auth** (`c0b9c3f`) :
  - CORS ciblé `/api/auth/*` avec `credentials: true` — cookies acceptés cross-origin
  - Wildcard route `/**` → `/*` (Hono) — `/sign-in/email` à 2 segments désormais matché
  - `signOut()` vérifie `res.ok` et lance si le cookie n'est pas effacé
  - `handleSignOut` en try-finally — redirection `/login` garantie même si sign-out échoue
  - 26/26 tests frontend · `npm run test:web`

---

## Modèle économique validé (réunion 27/04)

| Poste | Tarif |
|---|---|
| Développement (one-shot) | 1 600 € |
| Documentation + formation | 350 € |
| Maintenance / support | 65 €/h |
| Abonnement mensuel (10 premières connexions) | 15 €/mois |
| Par calendrier connecté supplémentaire | 4 €/mois |
| Coût réel Nylas par calendrier | 1,50 € (marge ~2,50 €) |

**Conditions :** acompte 30 % à réception du devis → attente SIRET auto-entrepreneur
**À négocier :** tarif Nylas dégressif au-delà d'un certain volume (> 100, > 500, > 1250 connexions)
**Hébergement :** VPS Hostinger BeeNice (Allemagne) — pas de frais hébergement côté Adam

---

## Points à valider avec Julien

1. **Test client Cos — Microsoft Enterprise** : Florian a-t-il contacté Cos ? Quelle date pour le test ?
2. **UX tâches vs. notifications** : valider l'UX actuelle (onglet Tâches) ou prioriser le refactor notifications avant le 15 ?
3. **Google Sheets** : partager export ou accès lecture au sheet (colonnes, valeurs dropdown)
4. **Documentation + formation** : format préféré (PDF / Notion / Obsidian) ? Session Zoom ou guide écrit ?
5. **Accès admin vs. colleur** : différencier davantage les accès ou scope actuel suffisant ?

---

## Contacts

| Personne | Rôle | Contact |
|---|---|---|
| Julien BOUIC | CEO BeeNice | julien@bee-nice.fr |
| Camille Six | Associée | camille@bee-nice.fr |
| Florian Caillet | Suivi projet / ops | florian@bee-nice.fr |

---

## Références

- [[TODO]] — état courant + ce qui reste
- [[ARCHITECTURE]] — modules, routes API, schéma DB
- [[functional-spec]] — feature specs détaillées
- [[onboarding]]
- [[routing-design]] — design routing % + questions client
- [[microsoft-enterprise-auth]]

---
<!-- dernière maj: 2026-06-09 (session 5) -->



## 2026-06-02 - Nylas Production : Google

Decision/procedure clarifiee : pour supporter Google dans le nouvel environnement Nylas Production BeeNiceCal, ajouter un connector Google dans la meme application Nylas Production, avec une app Google Cloud OAuth separee de test/prod si possible. L'app BeeNice accepte deja le provider public google/microsoft et envoie provider=google dans le flux Nylas Hosted OAuth.

Points a verifier : callback Nylas BeeNiceCal Production = /api/admin/integrations/nylas/callback sur l'origine de deploiement ; scopes minimaux calendrier Google = openid, userinfo.email, userinfo.profile si besoin, calendar ou calendar.readonly selon besoin de creation d'evenements ; Google OAuth consent et verification si app externe avec utilisateurs clients.


## 2026-06-03 - UX Connexions calendrier

Livraison repo : la vue Connexions calendrier a ete sortie de la sous-vue Admin et exposee via le menu Parametres > Connexions. La nouvelle route frontend est /admin/settings/connections. Elle affiche une liste compacte par client avec compteurs, detail reps au clic, et actions Copier/Ouvrir le lien d'invitation.

Le callback Nylas admin redirige maintenant vers /admin/settings/connections avec les query params connected ou connectionError, afin que le feedback de connexion arrive sur la page dediee.

Verification : npm run build OK ; route locale /admin/settings/connections OK ; GET /api/admin/reps OK.


### 2026-06-03 - Backend buffers 15/15 implementes

Livraison backend : les booking links par defaut utilisent maintenant 15 minutes de buffer avant et 15 minutes apres. Les anciens liens avec buffers 0/0 sont retro-remplis en 15/15, les valeurs custom non-zero sont conservees.

Comportement valide : un slot candidat doit avoir son intervalle protege libre (debut - 15 min jusqu a fin + 15 min). Les bookings BeeNice existants bloquent eux aussi leur intervalle protege, donc un RDV 10:00-10:30 bloque les slots 10:30 et 10:45, et le prochain slot valide est 11:00.

Tests : node --test mvp/server/lib/*.test.mjs mvp/server/lib/store/*.test.mjs => 167 pass.


### 2026-06-03 - Agent tooling : test coverage skill

Agent setup : installation du skill Codex personnel test-coverage depuis le repo GitHub mehdic/bazinga dans /Users/aramsis/.codex/skills/test-coverage. Le SKILL.md local a ete ajuste pour pointer vers le chemin Codex installe au lieu du chemin Claude .claude/skills. Aucun fichier applicatif BeeNice n'a ete modifie.



## 2026-06-03 - Google OAuth 403 / test users

Diagnostic : l'erreur Google "Acces bloque : nylas.com n'a pas termine la procedure de validation de Google" correspond a un blocage OAuth consent screen cote Google, pas a un bug BeeNice. Le code BeeNice envoie deja provider=google via Nylas Hosted OAuth.

Action immediate : ajouter contactpro.inart@gmail.com comme test user dans le Google Cloud OAuth consent screen de l'app rattachee au connecteur Google Nylas BeeNiceCal Production, puis retester la connexion.

Checks Nylas/Google : si l'ecran affiche encore nylas.com, verifier que le connecteur Google Nylas utilise bien le client ID/secret OAuth BeeNice. Scopes exacts retenus : openid, userinfo.email, userinfo.profile, https://www.googleapis.com/auth/calendar. Le scope calendar.event est invalide.

Production : pour des reps clients externes non allowlistes, passer l'app Google OAuth en external/published et faire la verification Google pour les scopes calendar sensibles. Runbook repo ajoute : docs/google-oauth-403.md.



## 2026-06-04 - Analyse migration framework backend

Analyse agent : le backend actuel Node HTTP brut est deja decoupe par domaines de routes, avec helpers JSON/body/match simples, SSE dedie, SQLite better-sqlite3 et provider Nylas separe. La migration vers un framework n'est pas prioritaire tant que les sujets produit/production restent routing par pourcentages, OAuth Google/Microsoft/Nylas, validation des flux booking et stabilisation admin.

Recommandation : ne pas migrer maintenant. Si une migration devient necessaire, Hono est le meilleur choix pour une migration legere et progressive ; Fastify est preferable seulement si l'objectif devient une API Node plus industrialisee avec schemas, validation, OpenAPI, logging et plugins. Express est le choix de familiarite, mais apporte moins de valeur structurelle a ce codebase.



## 2026-06-04 - Round robin par pourcentages : à valider avec Julien

Décision : le routing round robin pondéré (ex: 10/10/40/40) n'est pas à implémenter maintenant. À discuter avec Julien en réunion avant de commencer — scope, cas d'usage client exact, et priorité par rapport au reste du backlog à confirmer.



## 2026-06-06 - B1 Hono + B2 better-auth livrés (chantiers réunion Luca)

### B1 — Migration Node.js HTTP brut → Hono (commit `4bc83bb`)

Le backend `http.createServer` + dispatch regex a été remplacé par Hono + `@hono/node-server`. Routes découpées en fichiers dédiés (`admin-routes.mjs`, `book-routes.mjs`, `connection-routes.mjs`, `webhook-routes.mjs`, `streams.mjs`). Tests : 16/16 pass.

### B2 — Authentification email/mot de passe (commit `75a0c96`)

- `mvp/server/lib/auth.mjs` — better-auth configuré avec better-sqlite3 + Kysely adapter. Champs custom : `role` (admin/caller), `active`, `callerId`. Deux middleware factories Hono : `requireAdmin` et `requireAuth`.
- `mvp/server/lib/seed-users.mjs` — migration auto des tables better-auth via `auth.$context.runMigrations()` au démarrage. Seed : 1 admin (julien@beeniceagency.com) + 2 callers (clotilde, florian). Idempotent.
- Routes protégées : `/api/admin/*` → admin only, `/api/book/*` et `/api/caller/*` → authentifié. `/api/connect/*` et `/api/webhooks/*` restent publics.
- Endpoints auth : `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/session`.
- `callerId` retiré des URLs book (`/:slug/callers/:callerId/*` → `/:slug/*`) — déduit de `session.user.callerId`.
- `callers.user_id` (FK → table `user` de better-auth) ajouté via migration.

Contrainte technique : le projet utilise `node:sqlite`'s `DatabaseSync` pour la logique métier et `better-sqlite3` pour better-auth. Les deux pointent sur le même fichier SQLite (WAL mode) sans conflit.

Vérification e2e : 401 sans cookie, 403 caller sur admin, 200 admin sur admin, 200 caller sur book. Env vars à configurer : `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `ADMIN_SEED_PASSWORD`, `CALLER_SEED_PASSWORD`.

### Prochaines étapes (branche `feat/b1-hono-migration`)
- B3 — `GET /api/caller/workspaces` : nouveau `caller-routes.mjs`, réutilise `listActiveClients()` de `state.mjs`
- B4 — `PATCH /api/admin/tasks/:taskId` : ajouter `assignedCallerId` dans `admin-routes.mjs`
- B5 — Invitations calendrier prospect + colonne `rsvp_state` sur `bookings`



## 2026-06-07 - Code review PR #1 : corrections appliquées, merge main

Code review de la PR #1 (branche feat/b1-hono-migration) — 6 findings traités avant merge.

### Fixes appliqués (commit eb209d6)

- **Breaking change frontend** : URLs /callers/:id/bookings remplacées par /bookings dans useBookingWorkspaceController.ts — callerId désormais déduit de la session côté backend.
- **Error handler** : HTTPException passe avec son propre statut HTTP. Non-Error → 500 (au lieu de 400 pour tout).
- **SSE double onAbort** : cleanup + resolve fusionnés en un seul callback dans streams.mjs — évite fuite mémoire sur déconnexion.
- **Guards production** : crash au démarrage si BETTER_AUTH_SECRET, ADMIN_SEED_PASSWORD ou CALLER_SEED_PASSWORD absents en NODE_ENV=production.
- **parseBody() helper** (body.mjs) : corps vide → {}, JSON invalide → 400 explicite. Remplace le pattern silent-catch dans les 4 fichiers de routes.

### État repo

- PR #1 mergée sur main (squash commit 43b3280)
- Branche feat/b1-hono-migration supprimée
- 27 tests verts (16 routes + 11 notifications)

### Prochaines étapes B-series

- B3 — GET /api/caller/workspaces : nouveau caller-routes.mjs
- B4 — PATCH /api/admin/tasks/:taskId : champ assignedCallerId
- B5 — Invitations calendrier prospect + rsvp_state sur bookings
- Dockerfile + docker-compose + README déploiement (deadline 2026-06-16)

### 2026-06-08 - Maintenance dependances npm

Suite a npm install, audit corrige sans --force. Lockfile mis a jour pour react-router 7.17.0, vite 6.4.3 et postcss 8.5.15.

Verification : npm audit = 0 vulnerabilities ; npm run build OK ; npm run test:web OK (5 fichiers, 21 tests) ; node --test mvp/server/lib/*.test.mjs mvp/server/lib/store/*.test.mjs mvp/server/lib/http/*.test.mjs OK (194 tests).


## 2026-06-09 - Correctifs better-auth : login redirect et logout loop

Deux bugs signalés après livraison de F2 :
1. Connexion via LoginPage validée mais pas de redirection vers l'app.
2. Logout → redirection /login → retour immédiat dans l'app (boucle).

### Cause racine

4 écarts identifiés par audit + docs better-auth/Hono (context7) :
- CORS `app.use("/api/*", cors())` sans `credentials: true` → le navigateur rejette la réponse cookie cross-origin → la session n'est jamais créée côté client.
- Route `app.on(["GET","POST"], "/api/auth/**", ...)` — `**` non documenté dans Hono, `/sign-in/email` (2 segments) non matché.
- `signOut()` ne vérifiait pas `res.ok` → cookie toujours valide après un sign-out raté → `getSession()` retournait la session → redirect loop.
- `handleSignOut` sans try-finally → si `signOut()` lançait, `window.location.replace("/login")` jamais appelé.

### Fixes (commits `c0b9c3f` et `3ae6a85`)

| Fichier | Changement |
|---|---|
| `mvp/server/app.mjs` | CORS ciblé `/api/auth/*` avec `credentials: true` + `origin` dynamique ; `/**` → `/*` |
| `mvp/src/lib/auth.ts` | Vérification `res.ok` dans `signOut()` |
| `mvp/src/components/AppChrome.tsx` | `handleSignOut` enveloppé en try-finally |

26/26 tests frontend verts post-correctifs.


## 2026-06-09 - Formulaire prospect enrichi + suppression notification company_size

### Formulaire prospect : Civilité + Prénom + Nom (commit 334f5e2)

Champ unique "Nom du prospect" remplacé par 3 champs structurés :
- Civilité — Select Radix UI : M. / Mme / Non précisé
- Prénom (obligatoire) + Nom (obligatoire) — côte à côte
- prospectName calculé côté serveur = [civilité] prénom nom (rétrocompat tâches/admin)
- DB : 3 colonnes nullable ajoutées via ensureColumn (salutation, prospect_first_name, prospect_last_name)
- Composants mis à jour : useCallerController, ProspectForm, BookingConfirmDialog, CallerPage
- Admin detail expose aussi les 3 nouveaux champs

### Suppression notification "Taille société invalide"

parseCompanySize levait une erreur toast visible par le caller quand companySize absent de la requête availability.
Fix : retourne 0 silencieusement — routing utilise le pool "all" (comportement attendu).
company_size reste en DB mais est invisible dans toute l'UX.

Tests : 26/26 frontend · 97/97 backend · 9/9 smoke.



## 2026-06-11 - Correctif logout navbar auth

Bug traite : le bouton Déconnexion de la navbar pouvait rediriger vers /login puis reconnecter immédiatement l'utilisateur, empêchant de changer de compte admin.

Cause racine : better-auth rejetait POST /api/auth/sign-out avec Origin http://127.0.0.1:5174 car BETTER_AUTH_TRUSTED_ORIGINS ne contenait que http://localhost:5174 côté web. Le cookie de session restait donc valide et LoginPage redirigeait vers l'app.

Correctif repo : liste d'origines trusted centralisée dans mvp/server/lib/auth.mjs, réutilisée par le CORS auth dans mvp/server/app.mjs, et .env.example mis à jour avec localhost + 127.0.0.1 sur ports web/API. .env local ajusté pareil.

Tests : npm run test:web => 27 pass ; node --test mvp/server/lib/*.test.mjs mvp/server/lib/store/*.test.mjs mvp/server/lib/http/*.test.mjs => 195 pass ; npm run build OK.



## 2026-06-11 - Correctif auth callers + logout confirme

Bug traite : seuls les identifiants Julien fonctionnaient ; florian@beeniceagency.com et clotilde@beeniceagency.com retournaient User not found. Le logout navbar pouvait aussi sembler echouer si la session restait active.

Cause racine : la DB locale contenait uniquement Julien dans la table better-auth user. Les lignes callers existaient mais user_id etait null. seedAuthUsers quittait trop tot des qu'un user existait, donc une seed partielle n'etait jamais reparee.

Correctif repo : seedAuthUsers repare maintenant chaque user attendu individuellement, sans reset les mots de passe existants, puis relie callers.user_id a l'utilisateur auth correspondant. Le logout frontend confirme maintenant que GET /api/auth/get-session retourne null avant de rediriger vers /login ; sinon il affiche l'erreur et reste sur la page.

Action locale effectuee : seedAuthUsers lance une fois sur mvp/server/data/mvp.sqlite ; users presents : julien admin, clotilde caller, florian caller ; liens callers repares. Smoke local : sign-in florian avec CALLER_SEED_PASSWORD OK.

Tests : npm run test:web => 29 pass ; node --test mvp/server/lib/*.test.mjs mvp/server/lib/store/*.test.mjs mvp/server/lib/http/*.test.mjs => 196 pass ; npm run build OK.



## 2026-06-11 - Correctif logout 415 Better Auth

Livraison repo : signOut() envoie maintenant POST /api/auth/sign-out comme requete JSON Better Auth, avec Content-Type: application/json, credentials include, et body {}. La confirmation getSession() post-logout est conservee et l'AppChrome reste sur la page si la deconnexion echoue.

Tests ajoutes/ajustes : le test frontend verifie les headers/body JSON de signOut() ; la regression backend auth-routes utilise une requete navigateur avec content-type JSON et body {}.

Verification : npm run test:web => 29 pass ; node --test mvp/server/lib/http/auth-routes.test.mjs => 1 pass ; node --test mvp/server/lib/*.test.mjs mvp/server/lib/store/*.test.mjs mvp/server/lib/http/*.test.mjs => 196 pass ; npm run build OK (warning Vite chunk > 500 kB existant).
