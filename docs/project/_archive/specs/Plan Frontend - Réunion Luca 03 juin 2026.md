---
tags: [domaine/pro, projet/beeniche, type/plan, statut/actif, agents]
date: 2026-06-03
source: transcript réunion Adam + Luca, transcript_04/transcipt_luca_01.txt
---

# Plan Frontend — Réunion Luca 03 juin 2026

> Chantiers frontend issus de la réunion de démonstration avec Luca (dev frontend).
> Responsable : **Luca**.
> Ces chantiers dépendent des chantiers backend correspondants ([[Plan Backend - Réunion Luca 03 juin 2026]]).

**Liens :** [[Bee Nice Calendar]] · [[Plan Backend - Réunion Luca 03 juin 2026]] · [[Plan Technique - Livraison 15 juin]]

---

## Chantier F1 — Login page + guards de route

**Prérequis backend :** Chantier B2 (better-auth)  
**Bloque :** F2, F3

### Contexte
Aucun écran de login aujourd'hui. Tout est accessible sans authentification. Il faut une page de connexion et des guards de route qui redirigent selon le rôle.

### Fichiers à créer / modifier

| Fichier                               | Action                                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| `mvp/src/pages/LoginPage.tsx`         | Nouveau — formulaire email + mot de passe                        |
| `mvp/src/lib/auth.ts`                 | Nouveau — helpers `getSession()`, `signIn()`, `signOut()`        |
| `mvp/src/components/RequireAuth.tsx`  | Nouveau — redirect `/login` si pas de session                    |
| `mvp/src/components/RequireAdmin.tsx` | Nouveau — redirect `/caller` si role !== admin                   |
| `mvp/src/routes.tsx`                  | Modifier — ajouter route `/login`, wrapper les routes existantes |

### Logique de redirect post-login
- Role `admin` → `/admin/bookings`
- Role `caller` → `/caller`

### Vérification
- Accès direct `/admin/bookings` sans session → redirect `/login`
- Login admin → redirect `/admin/bookings`
- Login caller → redirect `/caller`
- Token expiré → redirect `/login`

---

## Chantier F2 — Vue unifiée colleur `/caller`

**Prérequis backend :** B3 (`GET /api/caller/workspaces`)  
**Prérequis frontend :** F1 (auth)

### Contexte
Aujourd'hui le colleur arrive sur une page d'accueil qui liste des workspaces par client (`/book/:slug`). C'est fragmenté et peu intuitif. La nouvelle vue est une interface unifiée : calendrier central + filtre client en haut + formulaire prospect à gauche.

### Route
`/caller` — remplace le flux `/book/:slug`. L'ancienne route `/book/:slug` redirige vers `/caller?workspace=:slug` pour la compatibilité.

### Layout

```
┌─────────────────────────────────────────────────────┐
│  [Filtre client ▼]  ◀ Semaine du 2 juin ▶  [Auj.]  │
├──────────────────┬──────────────────────────────────┤
│  Formulaire      │                                  │
│  prospect        │   Calendrier semaine              │
│  ─────────────── │   (Chantier F3)                  │
│  Nom prospect    │                                  │
│  Email           │                                  │
│  Entreprise      │                                  │
│  Notes           │                                  │
│                  │                                  │
├──────────────────┴──────────────────────────────────┤
│  Tâches de repositionnement ouvertes (liste)        │
└─────────────────────────────────────────────────────┘
```

### Filtre client
- Dropdown ou chips en haut — source : `GET /api/caller/workspaces`
- Sélection d'un client → recharge les dispos du workspace correspondant
- Vue vide par défaut (aucun client sélectionné = calendrier vide)

### Sidebar gauche — formulaire prospect
- Champs : Nom, Email, Entreprise, Notes
- Persistants pendant la navigation semaine à semaine
- Réinitialisés automatiquement après réservation réussie

### Modal tâches de repositionnement (au chargement)
- `GET /api/caller/tasks?status=open` au mount (endpoint existant)
- Si tâches ouvertes → modal avec fond flouté (overlay)
- Actions par tâche : "Repositionner maintenant" (précharge les infos prospect dans la sidebar) | "Plus tard"
- Fermeture du modal → tâches restent visibles dans la liste en bas de page

### Fichiers à créer / modifier

| Fichier | Action |
|---|---|
| `mvp/src/pages/CallerPage.tsx` | Nouveau — layout principal |
| `mvp/src/pages/caller/ProspectForm.tsx` | Nouveau — sidebar formulaire |
| `mvp/src/pages/caller/ClientFilter.tsx` | Nouveau — dropdown filtre client |
| `mvp/src/pages/caller/ReschedulingTasksModal.tsx` | Nouveau — modal tâches au login |
| `mvp/src/pages/caller/ReschedulingTasksList.tsx` | Nouveau — liste persistante en bas |
| `mvp/src/pages/caller/useCallerController.ts` | Nouveau — state management |
| `mvp/src/routes.tsx` | Modifier — ajouter `/caller`, redirect `/book/:slug` |

### Vérification
- Colleur connecté → `/caller` avec calendrier vide
- Sélection client "TeamStarter" → créneaux disponibles apparaissent
- Formulaire rempli + clic créneau → booking créé → formulaire reset + créneau disparaît
- Au login avec tâches ouvertes → modal s'affiche

---

## Chantier F3 — Calendrier semaine (librairie externe)

**Prérequis frontend :** F2 (vue colleur)

### Contexte
La vue actuelle (`SlotPicker`) est une grille de colonnes sans axe horaire. Les créneaux sont empilés sans tenir compte des trous temporels — visuellement incorrect et jugé "horrible". Il faut un vrai calendrier type Google Calendar avec axe des heures.

### Librairie
**`@schedule-x/react`** (alternative : FullCalendar). Critères : vue semaine avec axe horaire, `eventClick` callback, popup custom React, léger, compatible Tailwind. Luca valide le choix final après test.

### Comportement attendu

**Grille**
- Vue semaine lun-ven uniquement, axe 9h-18h
- Créneaux disponibles = événements cliquables, style BeeNice (couleur honey/amber distincte)
- Bookings existants du colleur = événements grisés, non cliquables
- Trous temporels visibles (les créneaux ne se collent pas)

**Interaction**
- Clic sur un créneau disponible → popup custom React avec :
  - Récapitulatif : prospect (depuis sidebar) + heure du créneau
  - Bouton "Confirmer la réservation" → `POST /api/book/:slug/bookings`
  - Bouton "Annuler"
- Après confirmation → slot disparaît (SSE + refetch)

**Navigation**
- Prev/next semaine → `GET /api/book/:slug/availability` rechargé
- SSE stream déjà implémenté (`/api/book/:slug/stream`) — conserver le listener pour invalidation temps réel

### Remplacement
- `SlotPicker.tsx` retiré de la vue colleur (remplacé par le nouveau composant)
- `AgendaBoard.tsx` (vue admin) reste **inchangé**

### Fichiers à créer / modifier

| Fichier | Action |
|---|---|
| `mvp/src/components/CallerCalendar.tsx` | Nouveau — wrapper schedule-x + logique slots |
| `mvp/src/components/SlotConfirmPopup.tsx` | Nouveau — popup de confirmation booking |
| `mvp/src/components/SlotPicker.tsx` | Retirer de la vue colleur (garder si utilisé ailleurs) |

### Vérification
- Créneau 9h30 positionné à mi-hauteur entre 9h et 10h sur l'axe
- Un trou de 2h entre créneaux est visuellement vide
- Clic créneau → popup → POST booking → créneau disparaît sur tous les onglets ouverts

---

## Chantier F4 — Améliorations vue admin

**Prérequis frontend :** F1 (auth)

### F4a — Badge provider sur les connexions rep

**Fichier :** `mvp/src/pages/AdminConnectionsPage.tsx`

- Afficher un badge `Google` ou `Microsoft` à côté de chaque connexion rep
- Source : champ `provider` déjà retourné par `GET /api/admin/reps`

### F4b — Dropdown timezone dans le formulaire client

**Fichier :** `mvp/src/pages/AdminSettingsPage.tsx`

- Remplacer `<input type="text">` timezone par un `<select>`
- Options minimales : `Europe/Paris`, `Europe/London`, `America/New_York`, `America/Los_Angeles`, `UTC`
- Valeur par défaut : `Europe/Paris`

### F4c — Assignation tâche de repositionnement depuis la vue admin

**Fichiers :** `mvp/src/pages/AdminBookingsPage.tsx` + `mvp/src/components/BookingDetailPanel.tsx`

- Sur le détail d'un booking avec statut `no_show` ou `cancelled` :
  - Dropdown "Assigner à" avec la liste des callers actifs (source : `GET /api/admin/settings`)
  - Caller original pré-sélectionné par défaut
  - Action : `PATCH /api/admin/tasks/:taskId` avec `{ assignedCallerId }`
- Endpoint backend : Chantier B4

### Vérification F4
- Connexion rep Google → badge "Google" affiché
- Connexion rep Microsoft → badge "Microsoft" affiché
- Formulaire client : sélection timezone dans dropdown → sauvegarde OK
- Admin réassigne tâche → colleur cible voit la tâche dans sa liste

---

## Chantier F5 — Affichage statut RSVP invitation calendrier

**Prérequis backend :** B5 (invitations calendrier)

### Fichier à modifier
`mvp/src/components/BookingDetailPanel.tsx`

- Ajouter une ligne "Invitation rep : En attente / Acceptée / Refusée" dans le détail du booking
- Source : champ `rsvpState` exposé par `GET /api/admin/bookings/:id`

---

## Récapitulatif dépendances frontend

```
F1 (Login + guards)
  ├── F2 (Vue colleur unifiée)
  │     └── F3 (Calendrier librairie externe)
  └── F4 (Améliorations admin)

F5 (RSVP) ← dépend de B5 (backend invitations)
```

## Nouvelles routes frontend

| Route         | Composant    | Notes                       |
| ------------- | ------------ | --------------------------- |
| `/login`      | `LoginPage`  | Nouveau                     |
| `/caller`     | `CallerPage` | Remplace `/book/:slug`      |
| `/book/:slug` | redirect     | → `/caller?workspace=:slug` |
|               |              |                             |

<!-- dernière maj: 2026-06-03 -->
