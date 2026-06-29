---
tags: [domaine/pro, projet/beeniche, type/plan, statut/actif, agents]
date: 2026-06-07
---

# Plan d'action — BeeNice Calendar

> Source de vérité unique pour le suivi des chantiers et actions.
> Contexte → [[Bee Nice Calendar]] · Specs → [[Spécifications Fonctionnelles]] · Archi → [[Architecture Technique]]

---

## Actions Adam (non-code)

- [ ] Créer l'application Azure pour l'auth Microsoft Enterprise (requis pour client Cos)
- [ ] Obtenir le numéro SIRET → envoyer devis + facture acompte 30 %
- [ ] Envoyer documentation Nylas (conformité RGPD, sécurité) à Julien
- [ ] Caler RDV Nylas pour négocier tarif volume
- [ ] Demander à Julien le schéma du Google Sheet (colonnes, valeurs dropdown)
- [ ] Valider scope et priorité du round robin avec Julien

---

## Backend
> Détail complet : [[Plan Backend - Réunion Luca 03 juin 2026]]

- [x] B5 — Invitations calendrier : `notify_participants=true` Nylas + colonne `prospect_rsvp_state` + mise à jour via webhook (`8be5447`)
- [x] B4 — `PATCH /api/admin/tasks/:taskId` — ajouter `assignedCallerId` dans `admin-routes.mjs` (`9c20339`)
- [x] B1 — Migration Node.js HTTP brut → Hono (`4bc83bb`)
- [x] B2 — Authentification email/mot de passe, rôles admin/caller — better-auth (`75a0c96`)
- [x] B3 — `GET /api/caller/workspaces` — `caller-routes.mjs`, response `{id,name,slug,timezone}` alignée spec (`9493f08` + `fc5edaa`)
- 🚫 B6 — Google Sheets sync — bloqué, attente schéma Julien

---

## Frontend
> Détail complet : [[Plan Frontend - Réunion Luca 03 juin 2026]]

- [x] F1 — Login page + guards de route — commits `82a8b11` + `c9aa935` (session 5h, guards, LoginPage, AppChrome role-aware, 21 tests Vitest)
- [x] F2 — Vue colleur unifiée `/caller` — commit `bd20c3e` (CallerPage, controller, ClientFilter, ProspectForm, BookingConfirmDialog, ReschedulingTasksModal, Radix Dialog, `/book/:slug` redirect → caller, 26 tests frontend)
- [ ] F3 — Calendrier semaine avec axe horaire — `@schedule-x/react` (dépend : F2)
- [ ] F4a — Badge provider Google/Microsoft sur connexions rep
- [ ] F4b — Dropdown timezone dans formulaire client
- [ ] F4c — Assignation tâche de repositionnement depuis vue admin (dépend : B4)
- [ ] F5 — Affichage statut RSVP dans détail booking (dépend : B5)

---

## Tickets livrables
> Détail complet : [[Plan Technique - Livraison 15 juin]]

- [x] T1 — Fix buffer défaut 0 → 15 min (`07c1f71`)
- [x] T2 — Supprimer champ taille de société (`bbff809`)
- [ ] T3 — Filtre semaine dans liste admin (frontend — backend déjà prêt)
- 🚫 T4 — Intégration Google Sheets — bloqué, attente schéma Julien
- [ ] T5 — Nettoyage code : extraire `withTempStore` + `createProviderStub` → `test-helpers.mjs`
- [ ] T6 — README déploiement VPS (`docs/DEPLOIEMENT.md`)
- [ ] T7 — Documentation fonctionnelle + technique + session de formation

---

## Standby (décision Julien)

- Round robin par pourcentages — à valider en réunion avant implémentation
- Vue Client miroir — mis en pause, remplacé par Google Sheets dans un premier temps
- B6 / T4 Google Sheets — bloqué sur schéma colonnes du sheet BeeNice

---

<!-- dernière maj: 2026-06-08 (session 4) -->
