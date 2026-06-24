---
tags: [domaine/pro, projet/beeniche, type/spec, statut/actif, agents]
aliases: [Spécifications Fonctionnelles]
date: 2026-06-02
---

# Spécifications Fonctionnelles — BeeNice Calendar

> Document de référence pour tous les agents. Couvre **toutes les features du produit** : celles déjà implémentées et celles à développer, avec leur logique métier exacte.
> Source : code du repo + transcripts réunions 17/04 et 27/04/2026.

**Liens rapides :** [[Bee Nice Calendar]] · [[Architecture Technique]]

---

## 1. Vue Colleur — Booking Workspace

### 1.1 Sélection du workspace client

**Statut :** ✅ Implémenté

La page d'accueil (`/`) liste tous les workspaces publics disponibles. Un *booking link* est identifié par un **slug** unique (ex: `teamstarter-discovery`). Le colleur sélectionne le workspace correspondant au client qu'il prospecte.

- Un colleur peut changer de workspace depuis l'interface.
- La liste des workspaces est retournée par `GET /api/book`.
- Chaque workspace appartient à un client et hérite de sa configuration (timezone, routing mode, reps connectés).

### 1.2 Affichage des disponibilités

**Statut :** ✅ Implémenté

**Route :** `GET /api/book/:slug/availability?companySize=&from=&to=`

**Logique de calcul des créneaux :**
1. Déterminer les reps éligibles selon le routing mode du client (voir section 3).
2. Pour chaque rep éligible, récupérer les intervalles occupés : bookings existants (actifs) + événements calendrier du provider (Nylas) + buffers.
3. Générer les créneaux jour par jour, **du lundi au vendredi uniquement**, sur la fenêtre configurée.
4. Pour chaque créneau candidat, vérifier qu'au moins un rep est disponible.
5. Retourner les créneaux avec `availableRepCount` et le `seniorityPool` applicable.

**Paramètres de la booking link (configurables par client) :**

| Paramètre | Défaut | Description |
|---|---|---|
| `durationMinutes` | 30 | Durée du RDV affiché dans le calendrier client |
| `intervalMinutes` | 30 | Intervalle entre les créneaux proposés |
| `bufferBeforeMinutes` | 15 | Tampon bloqué avant chaque RDV (validé 27/04) |
| `bufferAfterMinutes` | 15 | Tampon bloqué après chaque RDV (validé 27/04) |
| `minNoticeMinutes` | 60 | Préavis minimum avant qu'un créneau soit proposable |

**Fenêtre de réservation :** 12 semaines glissantes (validé 27/04 — initialement 4 jours, étendu à 2-3 mois).

**Buffer détaillé :** Un RDV de 30 min bloque 1h dans l'agenda du rep (15 min avant + 30 min RDV + 15 min après). Maximum 4 RDV dans un après-midi. Le meeting dans le calendrier client reste affiché 30 min.

**Invalidation temps réel :** Créneaux invalidés via SSE (`GET /api/book/:slug/stream`). Si un créneau est réservé depuis un autre onglet, il disparaît automatiquement sur tous les clients connectés.

### 1.3 Prise de rendez-vous

**Statut :** ✅ Implémenté

**Route :** `POST /api/book/:slug/bookings`

**Payload requis :**
```json
{
  "callerId": "...",
  "slotStart": "2026-04-28T09:30:00",
  "companyName": "Amazon",
  "companySize": 500,
  "prospectName": "Julien Test",
  "prospectEmail": "julien@test.com",
  "notes": "Intéressé par l'offre Enterprise"
}
```

**Flux de création :**
1. Vérifier que le créneau est toujours disponible (double-check au moment de la réservation — protection contre la race condition).
2. Assigner un rep via la logique de routing (voir section 3).
3. Créer l'événement dans le calendrier du rep via le provider (Nylas ou mock).
4. Persister le booking : `scheduleState = 'scheduled'`, `outcomeState = 'pending'`.
5. Émettre un événement SSE pour invalider le créneau sur tous les clients connectés.

**Notes :** Visibles par le rep dans la description de l'événement Google/Microsoft. Ne pas mettre d'informations sensibles.

**Champ `companySize` :** Décision 27/04 — retirer ce champ du template par défaut. Il ne sert que pour le routing `weighted_seniority` (1 seul client). Pour les autres clients (`pool_unique`), le champ est informatif seulement.

### 1.4 Liste des réservations du colleur

**Statut :** ✅ Implémenté

**Route :** `GET /api/book/:slug/callers/:callerId/bookings`

Retourne les bookings **actifs** (`scheduleState` ∈ {scheduled, rescheduled}) du colleur pour ce workspace. Vue : RDV à venir avec statut + possibilité d'annuler ou rebooker jusqu'au jour J.

### 1.5 Annulation par le colleur

**Statut :** ✅ Implémenté

**Route :** `POST /api/book/:slug/callers/:callerId/bookings/:bookingId/cancel`

- Annulable jusqu'au jour du rendez-vous.
- Annulation propagée au calendrier du rep via le provider.
- `scheduleState` → `'cancelled'`
- Création automatique d'une tâche de repositionnement (`follow_up_task`, type `reposition_booking`).

### 1.6 Tâches de repositionnement (vue colleur)

**Statut :** ✅ Implémenté

**Route :** `GET /api/book/:slug/callers/:callerId/tasks`

Quand un RDV est annulé ou marqué no-show, une tâche apparaît dans l'interface du colleur :
- Nom du prospect + entreprise
- RDV original (date/heure)
- Raison du déclenchement : `cancelled` ou `no_show`
- Action : rebooker directement depuis la tâche (formulaire pré-rempli, nouveau créneau à choisir)

Le rebooking libère l'ancien créneau et utilise la même logique de disponibilité que la prise initiale.

---

## 2. Vue Admin — Console de supervision

### 2.1 Dashboard métriques

**Statut :** ✅ Implémenté (partiel)

Métriques disponibles via `AdminBookingsResponse.counts` et `clientStats` :
- Total par statut : scheduled / completed / no_show / cancelled / rescheduled / not_qualified
- Par client : completedPct, noShowPct, toReplacePct, pendingCount, openTaskCount

### 2.2 Liste agrégée des réservations

**Statut :** ✅ Implémenté

**Route :** `GET /api/admin/bookings?status=&clientId=&callerId=&repId=&query=`

**Filtres disponibles :**
- Par client, statut, colleur, rep commercial
- Par texte libre (nom prospect, email, entreprise)

**Filtre par semaine :** ⚠️ **À implémenter** (demandé 27/04). Sélection semaine ← → pour les points hebdomadaires avec les clients. Paramètres : `from=` et `to=` déjà supportés par l'API, manque l'UI.

### 2.3 Vue calendrier agrégée

**Statut :** ✅ Implémenté

**Route :** `GET /api/admin/calendar?from=&to=&status=&clientId=&callerId=&repId=`

Vue semaine (lundi → vendredi) de tous les RDV. Navigation semaine par semaine. Mêmes filtres que la liste.

**SSE admin :** `/api/admin/stream` — invalidation temps réel quand un booking est créé/modifié.

### 2.4 Détail d'un rendez-vous + timeline

**Statut :** ✅ Implémenté

**Route :** `GET /api/admin/bookings/:bookingId`

Retourne :
- Toutes les informations du booking
- `assignmentReason` : détail de la décision de routing (mode, pool, candidats)
- `timeline` : historique chronologique immutable des événements

Types d'événements timeline :
- `booking_created` — création initiale
- `schedule_set` — déplacement manuel
- `calendar_rescheduled` — déplacement détecté côté provider
- `calendar_cancelled` — annulation détectée côté provider
- `outcome_set` — statut outcome modifié par l'admin
- `task_created` / `task_completed` — cycle de vie des tâches de repositionnement

### 2.5 Replanification admin

**Statut :** ✅ Implémenté

**Routes :**
- `GET /api/admin/bookings/:bookingId/availability` — créneaux disponibles (exclut le créneau actuel)
- `POST /api/admin/bookings/:bookingId/reschedule` — déplace le RDV

L'admin peut replanifier n'importe quel RDV actif. La replanification :
1. Libère le créneau original dans le calendrier du rep.
2. Crée un nouvel événement au nouveau créneau.
3. `scheduleState` → `'rescheduled'` + log dans timeline.

### 2.6 Gestion des statuts outcome

**Statut :** ✅ Implémenté

**Route :** `POST /api/admin/bookings/:bookingId/outcome`

L'admin indique le résultat réel d'un RDV :

| outcomeState | Signification |
|---|---|
| `pending` | RDV à venir ou résultat non encore renseigné |
| `completed` | RDV honoré |
| `no_show` | Prospect absent |
| `not_qualified` | Prospect non qualifié |

`displayStatus` = synthèse de `scheduleState` + `outcomeState`.

**No-show :** Actuellement saisi manuellement par l'admin. À terme : alimenté via intégration Google Sheets (section 5.1) ou vue Client Miroir (section 5.2).

### 2.7 Tâches admin

**Statut :** ✅ Implémenté (UX à revoir)

**Route :** `GET /api/admin/tasks`

Liste toutes les `follow_up_tasks` ouvertes. L'admin peut marquer `done` ou `dismissed`.

⚠️ UX à faire évoluer vers des *Notifications* plutôt que des tâches formelles (décision 27/04).

### 2.8 Paramètres — Gestion clients et colleurs

**Statut :** ✅ Implémenté

**Routes :** `GET /api/admin/settings` · `POST /api/admin/clients` · `POST /api/admin/callers`

**Créer un client :**
- Nom, timezone, routing mode (`pool_unique` / `weighted_seniority`)
- Génère automatiquement un booking link + invite token pour l'inscription des reps

**Ajouter un colleur :** Nom + actif par défaut.

**Voir les connexions :** Liste des reps par client avec statut de connexion calendrier.

---

## 3. Routing — Logique d'attribution des reps

### 3.1 Pool unique (premier arrivé, premier servi)

**Statut :** ✅ Implémenté
**Mode :** `pool_unique`

Tous les reps actifs et connectés du client forment un seul pool. La taille de société n'a aucun impact sur l'éligibilité. Attribution au rep avec le plus de disponibilité sur le créneau demandé.

Usage : Mode par défaut, utilisé par la majorité des clients BeeNice.

### 3.2 Round robin pondéré par seniority (héritage)

**Statut :** ✅ Implémenté (à remplacer)
**Mode :** `weighted_seniority`

Si `companySize >= companySizeThreshold` (défaut : 200), seuls les seniors sont éligibles. Sinon, pool complet avec pondération 80 % senior / 20 % junior.

**Décision 27/04 :** Supprimer le champ *taille de société* du template par défaut. Seul 1 client utilise ce mode.

### 3.3 Round robin par pourcentages

**Statut :** ❌ À implémenter — **Priorité 1**

**Contexte :** La majorité des clients veulent répartir la charge entre leurs reps selon des pourcentages explicites, indépendamment de la seniority.

**Exemple :** 4 reps, répartition 10% / 10% / 40% / 40%.

**Algorithme de déficit (itératif) :**
1. Chaque rep a un `pourcentageCible` configuré.
2. À chaque booking, calculer le déficit de chaque rep = `bookingsAttendusCumulés - bookingsReçusCumulés`.
3. Attribuer au rep avec le plus grand déficit.
4. Au départ (0 booking) : attribution séquentielle → le système se nivelle progressivement.

**Implémentation technique :**
- Modifier `routing_policies` : remplacer `senior_weight` / `junior_weight` par une structure `rep_percentages` (JSON par rep).
- Adapter `availability.mjs` → `assignRepForSlot` pour implémenter la logique de déficit.
- Stocker les compteurs de bookings par rep dans la table `bookings` (already available via query).

**Contrainte :** Template sans custom fields (décision 27/04 — stabilité et uniformité).

---

## 4. Connexion Calendriers

### 4.1 Inscription d'un rep (self-registration)

**Statut :** ✅ Implémenté

**Route publique :** `GET /api/connect/:token`

Flux :
1. Admin BeeNice crée un client → système génère un `connection_invite_token`.
2. Admin envoie le lien au client.
3. Le client transmet à ses commerciaux.
4. Chaque rep remplit le formulaire (prénom, nom, provider, rôle) et s'authentifie OAuth.

**Template défaut :** Sans champ custom (décision 27/04) — juste prénom, nom, provider (Google/Microsoft), rôle.

### 4.2 Connexion Google Calendar

**Statut :** ✅ Opérationnel (via Nylas)

OAuth Google géré par Nylas. Grant stocké dans `rep_calendar_connections`. Sync bidirectionnelle : modifications Google Calendar → refresh dans l'app.

### 4.3 Connexion Microsoft Calendar (Outlook/Exchange)

**Statut :** ⚠️ Partiellement implémenté — **Bloqué Azure app**

**Problème :** Les comptes Microsoft Enterprise (M365) nécessitent :
- Validation par l'administrateur IT de l'entreprise cliente, **ou**
- Que l'application soit enregistrée comme Azure AD app (tenant propre ou multi-tenant).

**Action requise :** Créer une Azure AD app registration avec permissions `Calendars.ReadWrite` déléguées.

**Urgence :** Client Cos (premier test) est sur Microsoft → **bloquant pour le test.**

Comptes Microsoft personnels : non affectés.

### 4.4 Sync bidirectionnelle et webhooks

**Statut :** ✅ Implémenté (Nylas webhooks)

**Route :** `POST /api/webhooks/nylas`

Nylas pousse des événements webhook quand un calendrier change :
- Événement supprimé côté rep → booking marqué `calendar_cancelled`.
- Événement déplacé → booking marqué `calendar_rescheduled`.

Job de refresh toutes les 60 s (`store.refreshCalendarBookings()`) en mode Nylas pour rattraper les webhooks manqués.

`calendarSyncState` ∈ {synced / stale / error}.

---

## 5. Intégrations externes

### 5.1 Intégration Google Sheets

**Statut :** ❌ Non implémenté — **Priorité 3**

**Contexte :** BeeNice utilise un Google Sheets partagé avec ses clients pour que ces derniers renseignent le statut des RDV (honoré / no-show / non qualifié / annulé). Ce sheet alimente Pipedrive via Zapier.

**Feature demandée (27/04) :**
- API qui fetch périodiquement le Google Sheet.
- Matching booking ↔ ligne du sheet sur prénom + nom + date.
- MAJ automatique de l'`outcomeState` dans l'app.
- Le colleur voit les statuts mis à jour chaque matin sans saisie manuelle.

**Prérequis :** Accès lecture au sheet (service account ou API key). Format : colonnes typées (dropdown).

**Note :** Temporaire — à terme remplacée par la vue Client Miroir.

### 5.2 Vue Client Miroir

**Statut :** ⏸ Standby — décision Julien 27/04

**Vision :** Accès en lecture au client (ex: Doctolib) sur ses propres RDV + possibilité d'indiquer le statut (no-show, annulé) directement dans l'app, sans passer par le Google Sheet.

**Pourquoi en standby :**
1. Nécessite un système de droits/rôles (admin vs. colleur vs. client).
2. Les colleurs freelancers ne doivent pas avoir accès aux paramètres admin.
3. Priorité inférieure à l'intégration Google Sheets pour le MVP.

**Rouvrir quand :** Système de droits implémenté.

### 5.3 Système de droits et d'accès

**Statut :** ❌ Non implémenté — prérequis vue Client Miroir

**Rôles à définir :**
- **Admin BeeNice** : accès complet (paramètres, tous les clients, tous les RDV)
- **Colleur** : accès workspace + ses propres RDV/tâches (pas les paramètres)
- **Client** : lecture sur ses RDV + saisie du statut outcome

Actuellement : pas d'authentification, toutes les routes sont publiques.

---

## 6. Contraintes métier transversales

### Créneaux
- **Durée fixe :** 30 min (affiché dans le calendrier client)
- **Intervalle :** 30 min (créneaux proposés toutes les 30 min)
- **Buffer :** 15 min avant + 15 min après (invisible côté client)
- **Jours ouvrés uniquement :** lundi → vendredi, pas de week-end
- **Fenêtre max :** 12 semaines glissantes depuis la semaine courante
- **Préavis minimum :** 60 min

### Unicité des connexions calendrier
- Un calendrier (adresse email provider) ne peut être connecté qu'à **un seul rep** à la fois.
- Si un rep tente de connecter un calendrier déjà utilisé, la connexion est refusée.

### Providers supportés
- Google Calendar ✅ opérationnel
- Microsoft Outlook/Exchange ⚠️ en cours (blocage Azure enterprise)
- Extension possible via Nylas : iCloud, Notion, autres (sur demande uniquement)

### Historique immutable
Tous les changements sont tracés dans `booking_status_history` et `booking_timeline_events`. On n'écrase jamais une ligne — on ajoute. L'état courant est toujours dérivé de l'entrée la plus récente.

---

<!-- dernière maj: 2026-06-02 -->
