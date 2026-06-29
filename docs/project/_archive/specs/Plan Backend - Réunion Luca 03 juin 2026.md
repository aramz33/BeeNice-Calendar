---
tags: [domaine/pro, projet/beeniche, type/plan, statut/actif, agents]
date: 2026-06-03
source: transcript réunion Adam + Luca, transcript_04/transcipt_luca_01.txt
---

# Plan Backend — Réunion Luca 03 juin 2026

> Chantiers backend issus de la réunion de démonstration avec Luca (dev frontend).
> Ces chantiers sont **en sus** du [[Plan Technique - Livraison 15 juin]] existant.
> Découpés pour exécution par agents indépendants.

**Liens :** [[Bee Nice Calendar]] · [[Plan Technique - Livraison 15 juin]] · [[Plan Frontend - Réunion Luca 03 juin 2026]]

---

## Chantier B1 — Migration Node.js brut → Hono

**Prérequis :** aucun  
**Bloque :** Chantier B2 (auth)

### Contexte
Le backend est un `http.createServer` avec dispatch manuel par regex. Il faut un vrai router avec middleware pour supporter l'auth proprement. Hono est le choix : TypeScript-native, 12KB, compatible `better-auth`, API proche du Node.js brut.

### Dépendances à installer
```
hono
@hono/node-server
```

### Fichiers à modifier
- `mvp/server/index.mjs` — remplacer `http.createServer` + dispatch regex par `new Hono()` + `serve()`
- `mvp/server/lib/http/admin-routes.mjs` — adapter handlers : `res.writeHead` + `res.end(JSON)` → `c.json()`
- `mvp/server/lib/http/book-routes.mjs` — idem
- `mvp/server/lib/http/connection-routes.mjs` — idem
- `mvp/server/lib/http/webhook-routes.mjs` — idem

### À préserver sans changement
- `state.mjs`, `database.mjs`, `provider.mjs`, `availability.mjs` — zéro modification
- SSE (`/api/book/:slug/stream`, `/api/admin/stream`) — Hono supporte le streaming natif

### Vérification
- `npm run dev:api` démarre sans erreur
- `node --test mvp/server/lib/*.test.mjs` → tous les tests verts
- Les endpoints existants répondent (curl ou frontend)

---

## Chantier B2 — Authentification : better-auth + table users

**Prérequis :** Chantier B1 (Hono)  
**Bloque :** Chantier F1 (login frontend)

### Contexte
Aucun système d'auth aujourd'hui. Tout le monde accède à tout. Il faut deux rôles : `admin` (Julien, Camille) et `caller` (colleurs BeeNice). Tout le monde s'authentifie avec email + mot de passe.

### Schéma DB — nouvelle table `users`
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'caller')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
```

### Migration table `callers` existante
```sql
ALTER TABLE callers ADD COLUMN user_id TEXT REFERENCES users(id);
```
Les callers seedés existants reçoivent un `user_id` associé dans le seed.

### Intégration better-auth
- Installer `better-auth`
- Configurer l'adapter `better-sqlite3` (déjà présent en dépendance)
- Endpoints exposés automatiquement :
  - `POST /api/auth/sign-in`
  - `POST /api/auth/sign-out`
  - `GET /api/auth/session`
- Middleware Hono appliqué sur :
  - `/api/admin/*` → requiert role `admin`
  - `/api/book/*` et `/api/caller/*` → requiert role `admin` ou `caller`

### Changement d'identification des callers
Aujourd'hui `callerId` passe dans l'URL. Après cette migration :
- `callerId` est déduit de `session.user.callerId` côté serveur
- Les routes `/api/book/:slug/callers/:callerId/*` sont simplifiées (plus de callerId en paramètre)

### Seed mis à jour (`mvp/server/lib/seed.mjs`)
- 1 user admin : email `julien@beeniceagency.com`, mot de passe via env var `ADMIN_SEED_PASSWORD`
- 2 users callers liés aux callers seedés existants

### Vérification
- `POST /api/auth/sign-in` avec credentials admin → session active
- `GET /api/admin/bookings` sans token → 401
- `GET /api/admin/bookings` avec token caller → 403
- `GET /api/admin/bookings` avec token admin → 200

---

## Chantier B3 — Endpoint `/api/caller/workspaces`

**Prérequis :** Chantier B2 (auth)  
**Consommé par :** Chantier F2 (vue colleur unifiée)

### Contexte
La vue colleur unifiée a besoin d'une liste des clients disponibles pour le filtre client. L'endpoint `GET /api/book` existant liste les workspaces publics, mais il faut une version authentifiée qui confirme l'identité du caller depuis la session.

### Endpoint à créer
```
GET /api/caller/workspaces
Auth : caller ou admin requis

Réponse :
{
  "workspaces": [
    { "id": "...", "name": "TeamStarter", "slug": "teamstarter-discovery", "timezone": "Europe/Paris" },
    ...
  ]
}
```

### Implémentation
- Nouveau fichier `mvp/server/lib/http/caller-routes.mjs`
- Réutilise `listActiveClients()` de `state.mjs`
- Monté sur `/api/caller/*` dans `index.mjs`

---

## Chantier B4 — Endpoint `PATCH /api/admin/tasks/:taskId` (assignation colleur)

**Prérequis :** Chantier B2 (auth)  
**Consommé par :** Chantier F3 (améliorations admin)

### Contexte
L'admin doit pouvoir réassigner une tâche de repositionnement à un colleur différent du colleur original. Aujourd'hui `updateTask()` existe dans `state.mjs` mais l'endpoint admin ne supporte pas `assignedCallerId`.

### Endpoint à modifier
```
PATCH /api/admin/tasks/:taskId
Auth : admin requis
Body: {
  "assignedCallerId"?: string,
  "status"?: "open" | "done" | "dismissed"
}
```

Modifier `mvp/server/lib/http/admin-routes.mjs` pour accepter et passer `assignedCallerId` à `updateTask()`.

---

## Chantier B5 — Invitations calendrier (prospect + RSVP rep)

**Prérequis :** aucun (indépendant)

### Contexte
Quand un booking est créé, Nylas crée l'événement dans le calendrier du rep mais :
1. Le prospect ne reçoit pas d'invitation
2. Le statut accept/decline du rep n'est pas stocké

### Ce qu'il faut faire

**1. Invitation prospect**
- Dans `createBooking()` (`state.mjs`) : ajouter `prospectEmail` au champ `participants` de l'événement Nylas lors de la création

**2. Suivi RSVP rep**
- Ajouter colonne `rsvp_state TEXT NOT NULL DEFAULT 'pending'` sur la table `bookings`
- Valeurs : `pending`, `accepted`, `declined`
- Exposer `rsvpState` dans `GET /api/admin/bookings/:id`

### Vérification
- Booking créé → prospect reçoit invitation Google/Outlook
- Vue admin → détail booking → champ `rsvpState` présent

---

## Chantier B6 — Google Sheets sync (bloqué — en attente Julien)

**Statut :** hors scope v1 — bloqué sur schéma du sheet

### Ce qu'on sait
- Livrable contractuel : "intégration Google Sheet de récupération automatique du statut des rendez-vous via l'API Google Sheet"
- Le sheet BeeNice est partagé avec les clients
- Les clients y renseignent les statuts (no-show, annulé, non qualifié)
- L'app doit lire ces colonnes et mettre à jour `outcomeState` + créer des `FollowUpTask` automatiquement

### Questions bloquantes (à poser à Julien)
1. Structure exacte des colonnes (noms, ordre)
2. Un sheet par client ou sheet global BeeNice ?
3. Valeurs exactes des dropdowns (ex : "No show" ou "no-show" ?)
4. Qui fournit les credentials service account Google ?

### Architecture cible (à implémenter dès réception schéma)
- `mvp/server/lib/sheets.mjs` — client Google Sheets API v4, lecture seule, auth service account
- Job périodique dans `index.mjs` via `setInterval` (configurable via `MVP_SHEETS_SYNC_INTERVAL_MS`)
- Matching booking ↔ ligne sheet : par heure + email prospect
- Env vars à ajouter : `MVP_GOOGLE_SPREADSHEET_ID`, `MVP_GOOGLE_SERVICE_ACCOUNT_JSON`

---

## Récapitulatif dépendances backend

```
B1 (Hono)
  └── B2 (better-auth)
        ├── B3 (endpoint caller/workspaces)
        └── B4 (PATCH tasks assignation)

B5 (invitations calendrier) ← indépendant
B6 (Google Sheets) ← bloqué externe
```

## Tables DB modifiées

| Table | Changement |
|---|---|
| `users` (nouvelle) | id, name, email, password_hash, role, active, created_at |
| `callers` (existante) | +`user_id` TEXT FK → users |
| `bookings` (existante) | +`rsvp_state` TEXT DEFAULT 'pending' |

## Nouveaux endpoints

| Méthode | Route | Chantier |
|---|---|---|
| POST | `/api/auth/sign-in` | B2 |
| POST | `/api/auth/sign-out` | B2 |
| GET | `/api/auth/session` | B2 |
| GET | `/api/caller/workspaces` | B3 |
| PATCH | `/api/admin/tasks/:taskId` | B4 |

<!-- dernière maj: 2026-06-03 -->
