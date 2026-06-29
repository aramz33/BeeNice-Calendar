---
tags: [domaine/pro, projet/beeniche, type/plan, statut/actif, agents]
date: 2026-06-02
---

# Plan Technique — Livraison 15 juin 2026

> Source : session de grillage du 2026-06-02 — analyse codebase + transcripts réunions 27/04.
> Branche `feat/admin-reschedule-rep-connect` mergée sur `main` ce jour (62 tests verts, build propre).
> Ce document est le contrat d'implémentation pour les agents qui vont coder.

**Liens rapides :** [[Bee Nice Calendar]] · [[Spécifications Fonctionnelles]] · [[Architecture Technique]] · [[Réunion Julien - Points à discuter]]

---

## Scope livraison 15 juin

### Inclus (à coder)
1. Fix bug buffer (défaut 0 → 15 min)
2. Supprimer champ taille de société (UI + logique)
3. Filtre semaine dans liste admin
4. Intégration Google Sheets *(bloquée sur format sheet — voir ce soir)*
5. Nettoyage code : helpers test dupliqués, cohérence utils

### Livrables non-code
6. README déploiement VPS (nginx + pm2 + .env)
7. Documentation technique + fonctionnelle
8. Session de formation BeeNice

### Action externe (non-code, Adam uniquement)
- Créer Azure AD app registration (Microsoft Enterprise / client Cos)
- Négocier tarif Nylas volume
- Finaliser SIRET auto-entrepreneur

### Hors scope / dépriorisé
- Round robin par pourcentages (décision 2026-06-02)
- Vue Client Miroir (standby Julien)
- Système droits/rôles
- UX tâches → notifications (à valider avec Julien — voir [[Réunion Julien - Points à discuter]])

---

## Ticket 1 — Fix buffer défaut 0 → 15 min

**Priorité :** P0 — bug silencieux, feature contractuelle cassée en prod

**Problème :** Logic buffer correcte dans `availability.mjs` mais rendue inopérante partout :
- `database.mjs:594-599` : migration `normalizeLegacyData` reset tous les buffers à 0 (patch temporaire jamais retiré)
- `store/persistence.mjs:480-481` : `createBookingLinkForClient` crée avec `bufferBeforeMinutes: 0`
- `seed.mjs:125-126` et `seed.mjs:353-354` : deux booking links seedés avec buffer 0

**Fichiers à modifier :**
- `mvp/server/lib/database.mjs` — supprimer lignes 594-599 (UPDATE buffer = 0)
- `mvp/server/lib/store/persistence.mjs` — changer défaut `bufferBeforeMinutes: 15, bufferAfterMinutes: 15`
- `mvp/server/lib/seed.mjs` — changer buffer à 15/15 pour les deux booking links (TeamStarter + Doctolib)

**Vérification :** Fresh DB, créer un booking, vérifier que le créneau suivant est indisponible 15 min avant et après.

---

## Ticket 2 — Supprimer champ taille de société

**Priorité :** P1 — décision réunion 27/04, template uniforme

**Contexte :** Seul 1 client utilise `weighted_seniority` (legacy). Tous nouveaux clients = `pool_unique`. Champ confus et inutile pour 95 % des cas. Décision : supprimer complètement de l'UI. Le champ reste en base pour l'historique existant.

**Fichiers à modifier :**

*Frontend :*
- `mvp/src/pages/BookingWorkspacePage.tsx` — retirer le bloc Label + Select `company-size` et son import
- `mvp/src/pages/booking-workspace/useBookingWorkspaceController.ts` — retirer `companySize` state, `setCompanySize`, dépendances dans `useMemo`/`useEffect` ; passer `companySize: 0` hardcodé dans le payload si l'API en a besoin

*Backend (pas de breaking change) :*
- `mvp/server/lib/http/book-routes.mjs` — `companySize` reste accepté en paramètre optionnel
- `mvp/server/lib/availability.mjs` — `parseCompanySize("")` retourne 0, routing `pool_unique` non affecté

**Vérification :** Charger `/book/teamstarter-discovery`, vérifier absence du select taille. Prendre un RDV, vérifier assignation correcte.

---

## Ticket 3 — Filtre semaine dans liste admin

**Priorité :** P2 — demande explicite Julien (transcript 00:35:53)

**Contexte :** Vue agenda admin passe déjà `from`/`to` à `/api/admin/calendar`. Liste bookings (`/api/admin/bookings`) ne filtre pas par date.

**Fichier à modifier :**
- `mvp/src/pages/admin-bookings/useAdminBookingsController.ts` ligne 108 — ajouter `params.set("from", weekStart.toISOString())` et `params.set("to", visibleWeekEnd.toISOString())` dans le fetch liste (même logique que calendar fetch lignes 104-105)

Backend déjà prêt : `listAdminBookings` dans `store/admin-bookings.mjs` accepte et filtre sur `from`/`to`.

**Vérification :** Naviguer semaine par semaine — liste bookings change avec la semaine sélectionnée.

---

## Ticket 4 — Intégration Google Sheets

**Priorité :** P1 — livrable contractuel (inclus dans 1 600 €)

**Statut :** ⚠️ Bloqué — format exact du sheet BeeNice inconnu. Démarrer ce soir dès réception format.

**Spec (réunion 27/04) :**
- Fetch périodique du Google Sheet BeeNice
- Matching booking ↔ ligne sheet sur prénom + nom + date prospect
- MAJ automatique de `outcomeState` (`completed` / `no_show` / `cancelled` / `not_qualified`)
- Colleur voit statuts à jour chaque matin sans saisie manuelle

**Architecture cible :**
- Nouveau module `mvp/server/lib/sheets.mjs` — client Google Sheets API (lecture seule)
- Auth : service account JSON (clé dans env var `MVP_GOOGLE_SERVICE_ACCOUNT_JSON`)
- Job sync périodique dans `mvp/server/index.mjs` — `setInterval` configurable via `MVP_SHEETS_SYNC_INTERVAL_MS`
- Ajout `.env.example` : `MVP_GOOGLE_SPREADSHEET_ID`, `MVP_GOOGLE_SERVICE_ACCOUNT_JSON`

**Questions bloquantes (à résoudre ce soir) :**
1. Structure colonnes du sheet (noms exacts, ordre)
2. Un sheet par client ou sheet global BeeNice ?
3. Valeurs exactes des dropdowns (ex : "No show" ou "no-show" ?)
4. Qui fournit les credentials service account ?

**Fichiers à créer/modifier :**
- `mvp/server/lib/sheets.mjs` — nouveau (client + matching + sync)
- `mvp/server/lib/state.mjs` — wirer le job de sync au démarrage
- `mvp/server/index.mjs` — démarrer le job périodique
- `.env.example` — ajouter les nouvelles vars

---

## Ticket 5 — Nettoyage code (restitution)

**Priorité :** P2 — code lisible et restituable à une autre personne

Nettoyage, refactoring et réorganization du repo en entier, afin de le rendre plus clair, et plus propre. Le repo doit refléter le travail d'un dev senior qui organise sans redondance, avec des noms clair, des commentaires clair, simple et direct et une arborescence/architecture qui laisse comprendre le contenu du code et les separations logiques rapidement, sans devoir lire toute les lignes. 

**Problème :** `withTempStore` et `createProviderStub` dupliqués dans 6 fichiers de test :
`availability.test.mjs`, `booking-flows.test.mjs`, `connection-ownership.test.mjs`, `tasks.test.mjs`, `store/public-booking.test.mjs`, `store/admin-bookings.test.mjs`

**Fix :** Créer `mvp/server/lib/test-helpers.mjs` avec les deux fonctions. Chaque test file importe depuis ce module. La version extraite accepte `mode` avec défaut `"mock"`.

**Vérification :** `node --test` sur tous les fichiers de test — 62 tests verts.

---

## Ticket 6 — README déploiement VPS

**Priorité :** P1 — prérequis test Cos sur Hostinger BeeNice

**Livrable :** `docs/DEPLOIEMENT.md`

**Contenu :**
1. Prérequis serveur (Node.js 20+, git, pm2)
2. Clone + install + build
3. Configuration `.env` (clés Nylas prod)
4. Lancement via pm2 + config systemd
5. Config nginx (reverse proxy → HTTPS)
6. Ajout client + connexion reps (pas à pas)
7. Renouvellement HTTPS (certbot)

---

## Ticket 7 — Documentation et formation

**Priorité :** P2 — livrable contractuel 350 €

**Clarifier avec Julien ([[Réunion Julien - Points à discuter]]) :** format (PDF / markdown / Notion) + modalités formation.

**Contenu attendu :**
- Guide colleur : prise de RDV, repositionnement, tâches
- Guide admin : supervision, statuts, paramètres, connexions
- Guide technique : déploiement, variables env, ajout client/rep
- Guide connexion calendrier : Google OAuth + Microsoft Enterprise (Azure)

---

## Ordre d'exécution recommandé

| Jour       | Ticket                                            | Durée estimée |
| ---------- | ------------------------------------------------- | ------------- |
| J+1        | T1 — Fix buffer                                   | 30 min        |
| J+1        | T2 — Supprimer taille société                     | 2h            |
| J+1        | T3 — Filtre semaine admin                         | 1h            |
| J+1        | T5 — Nettoyage test helpers                       | 1h            |
| J+2-3      | T4 — Google Sheets (après format sheet)           | 3-5h          |
| J+4        | T6 — README déploiement                           | 1h            |
| J+4-5      | T7 — Documentation                                | 3-5h          |
| Avant J+13 | Réunion Julien : UX notifications + date test Cos | —             |

---

## État codebase au 2026-06-02

| Indicateur | Valeur |
|---|---|
| Tests | 62 / 62 verts |
| Build | Propre (482 kB) |
| Branche | tout mergé sur `main` |
| Buffer logic | Correcte dans `availability.mjs`, défaut cassé (T1) |
| Routing | `pool_unique` + `weighted_seniority` opérationnels |
| Round robin % | Dépriorisé |
| Google Sheets | 0 ligne de code |
| Déploiement | 0 config ops |

---

---

## Ticket 8 — Refonte UX (session 2026-06-02)

###  ⎿  Plan saved to: ~/.claude/plans/lets-work-on-making-lovely-panda.md · /plan to edit                                    

**Priorité :** P1 — polish avant démo client

**Contexte :** Session de grillage UX (2026-06-02). Les deux surfaces (workspace caller + admin) souffrent d'un flux peu clair, d'une hiérarchie d'information faible, et d'un layout chargé. Décisions actées ci-dessous.

### Décisions actées

| Surface | Décision |
|---------|----------|
| Workspace — layout desktop | 2 colonnes (formulaire gauche, SlotPicker droite), fold colonne unique < 900px |
| Workspace — flux | Formulaire prospect en premier (pendant l'appel), SlotPicker en second (fin d'appel) |
| Workspace — métriques | Supprimées. Badge "X reps disponibles" près du SlotPicker uniquement |
| Workspace — sections secondaires | Tâches / RDV récents / Pool → accordéon replié par défaut en bas de page |
| Admin — détail RDV | Sheet/tiroir latéral (slide droite) avec navigation ← → entre RDVs |
| Admin — dashboard | Graphe barres hebdomadaires par statut (recharts) + métriques redessinées |
| Admin — onglets | Conserver 4 onglets. Renommer "RDV" → "Liste" |

### Nouvelles dépendances
- `recharts` — graphe barres
- `@radix-ui/react-dialog` — base du Sheet

### Fichiers modifiés
- `mvp/src/pages/BookingWorkspacePage.tsx` — refonte layout + spinner + validation inline + confirmation annulation
- `mvp/src/pages/booking-workspace/useBookingWorkspaceController.ts` — exposer eligibleRepCount
- `mvp/src/pages/AdminBookingsPage.tsx` — dashboard + sheet + filtre semaine
- `mvp/src/pages/admin-bookings/useAdminBookingsController.ts` — navigation sheet + weekFilter
- `mvp/src/components/BookingSheet.tsx` — nouveau
- `mvp/src/components/BookingsChart.tsx` — nouveau
- `mvp/src/components/AccordionSection.tsx` — nouveau
- `mvp/src/components/ui/input.tsx` + `select.tsx` — bordures navy/30

<!-- dernière maj: 2026-06-02 -->
