# Guide de test manuel du MVP depuis le navigateur

Ce document explique comment **comprendre** et **tester** le MVP uniquement depuis l’interface frontend, comme si vous étiez un utilisateur qui découvre le produit dans le navigateur.

Le MVP est volontairement limité à un cas d’usage précis :

- `1 client seedé`
- `1 lien de booking`
- `2 callers`
- `3 commerciaux`
- `1 console admin`

L’objectif n’est pas de montrer un produit fini, mais de vérifier que le cœur métier fonctionne :

- un caller voit des créneaux consolidés
- il réserve sans choisir manuellement le commercial
- le système route automatiquement
- l’admin récupère immédiatement la visibilité sur le rendez-vous et son cycle de vie

---

## 1. Lancer le MVP

Depuis la racine du projet :

```bash
npm run dev
```

Le MVP démarre avec :

- frontend : `http://localhost:5174`
- API locale : `http://localhost:8787`
- base locale SQLite : `mvp/server/data/mvp.sqlite`

Si vous voulez juste vérifier que le frontend compile :

```bash
npm run build
```

---

## 2. Les 3 pages à connaître

### Accueil

URL :

```text
http://localhost:5174/
```

Cette page sert à comprendre le positionnement du MVP.

Elle résume :

- pourquoi le produit remplace Calendly pour ce workflow
- ce que prouve le MVP
- où aller ensuite pour tester

Ce qu’il faut valider :

- le thème et l’apparence reprennent bien l’univers visuel du prototype existant
- les deux entrées principales sont visibles :
  - `Workspace caller`
  - `Admin`

### Workspace caller

URL :

```text
http://localhost:5174/book/teamstarter-discovery
```

C’est la page la plus importante du MVP.

Elle représente l’outil utilisé par un caller Be Nice pendant son appel.

### Console admin

URL :

```text
http://localhost:5174/admin/bookings
```

Cette page représente la supervision interne.

Elle doit permettre de voir :

- qui a booké
- pour quelle société
- à quel commercial cela a été attribué
- comment le rendez-vous a évolué ensuite
- et quel commercial a un calendrier réellement connecté

---

## 3. Ce qu’il faut comprendre avant de tester

Le MVP n’est **pas** un calendrier classique.

Le raisonnement à garder en tête :

1. Le caller ne choisit pas un commercial.
2. Le caller choisit seulement un créneau.
3. Le backend décide quel commercial reçoit le rendez-vous.
4. Cette décision dépend :
   - de la disponibilité réelle
   - de la taille de la société
   - de la pondération senior/junior

Le MVP implémente cette logique :

- si `company size >= 200`, le pool devient `senior uniquement`
- sinon le pool est `complet`
- ensuite le système applique une logique pondérée `80/20`

Donc, quand vous testez, l’enjeu n’est pas “est-ce que je peux cliquer sur un calendrier ?”.

L’enjeu est :

- est-ce que le système masque correctement la complexité au caller ?
- est-ce que la supervision est lisible côté admin ?

---

## 4. Parcours de test principal

### Étape 1 : ouvrir le workspace caller

Allez sur :

```text
http://localhost:5174/book/teamstarter-discovery
```

Vous devez voir :

- un bloc de métriques
- un formulaire de contexte d’appel
- une zone de disponibilités live
- une liste des commerciaux connectés
- un panneau “rendez-vous du caller”

Ce qu’il faut vérifier :

- la page semble orientée usage opérationnel, pas “agenda perso”
- les créneaux sont visibles sans demander de choisir un commercial
- les commerciaux sont affichés comme un pool, pas comme un choix manuel

### Étape 2 : choisir un caller

Dans le champ `Caller`, choisissez :

- `Clotilde`
ou
- `Florian`

Ce que cela teste :

- le système attribue bien le booking à un caller
- la vue admin pourra ensuite remonter cette information

### Étape 3 : tester la qualification par taille d’entreprise

Choisissez une taille de société.

Faites deux tests distincts :

#### Cas A : société < 200

Exemple :

- `50 à 199 salariés`

Vous devez voir une indication proche de :

- `Pool complet`

Cela signifie :

- seniors + juniors peuvent recevoir le rendez-vous

#### Cas B : société >= 200

Exemple :

- `200 à 499 salariés`

Vous devez voir une indication proche de :

- `Pool senior uniquement`

Cela signifie :

- seuls les commerciaux seniors sont éligibles

Ce test est fondamental, car c’est la preuve que le booking n’est pas juste un agenda partagé, mais un système de routage métier.

### Étape 4 : sélectionner un créneau

Dans la zone de disponibilités :

- choisissez un créneau
- vérifiez que le bloc “Créneau sélectionné” se met bien à jour

Ce qu’il faut observer :

- les créneaux sont groupés par jour
- chaque créneau indique combien de reps sont disponibles
- le caller n’a jamais besoin d’interpréter un agenda complexe

### Étape 5 : réserver un rendez-vous

Remplissez :

- `Nom du prospect`
- `Email`
- `Société`
- `Contexte call`

Puis cliquez sur :

`Réserver le rendez-vous`

Ce qu’il faut vérifier :

- un toast de succès apparaît
- le formulaire reste exploitable
- le créneau sélectionné est libéré côté UI
- le nouveau booking apparaît dans `Rendez-vous du caller`

---

## 5. Parcours pour comprendre le “live”

Le transcript insistait sur un point non négociable :

- si un caller prend un créneau, il doit disparaître pour les autres

Le MVP a été conçu pour ça avec un flux SSE.

### Test recommandé

Ouvrez **deux onglets** sur :

```text
http://localhost:5174/book/teamstarter-discovery
```

Dans les deux onglets :

- choisissez une taille de société identique
- laissez la page ouverte

Ensuite :

1. Dans l’onglet A, réservez un créneau.
2. Observez l’onglet B.

Ce qu’il faut vérifier :

- le slot disparaît ou la disponibilité se recalcule sans rechargement manuel

Important :

Si un créneau reste visible, cela peut être normal si **un autre commercial éligible reste disponible** sur le même créneau.

Le système ne raisonne pas “un créneau = une personne”.

Il raisonne “un créneau reste disponible tant qu’au moins un rep éligible est encore libre”.

C’est une logique de **pool de disponibilité**, pas une logique de case unique.

---

## 6. Parcours admin

Ouvrez :

```text
http://localhost:5174/admin/bookings
```

Vous devez voir :

- des métriques en haut
- des filtres
- une liste de bookings
- un panneau de détail
- un panneau de connexions calendrier

### Étape 1 : lire les métriques

Vérifiez que la page expose au moins :

- bookings réservés
- bookings validés
- bookings à replacer
- connexions reps

Ce qu’il faut comprendre :

- cette page sert à la supervision Be Nice
- ce n’est pas juste un historique technique

### Étape 1 bis : tester les connexions calendrier

Dans le bloc `État des connexions`, vérifiez :

- le mode courant :
  - `mock`
  - ou `Nylas`
- le statut de chaque rep :
  - `connected`
  - `auth_required`
  - `error`

Si le backend tourne en `mock` :

- cliquez sur `Simuler la connexion` ou `Reconnecter en mock`
- vérifiez qu’un toast s’affiche
- rechargez la page
- vérifiez que l’état de connexion est conservé

Si le backend tourne en `nylas` avec les variables d’environnement configurées :

- choisissez un provider :
  - `Google`
  - ou `Microsoft`
- cliquez sur `Connecter via Nylas`
- laissez le flow Hosted OAuth revenir vers `/admin/bookings`
- vérifiez que le rep passe en `connected`

Ce test permet de valider que le MVP garde maintenant un état persistant, et ne repart plus de zéro à chaque redémarrage.

### Étape 2 : filtrer

Testez les filtres :

- par statut
- par caller
- par rep
- par recherche texte

Ce qu’il faut vérifier :

- la liste se met bien à jour
- les résultats restent cohérents avec les métriques et les détails

### Étape 3 : ouvrir le détail d’un booking

Cliquez sur un booking.

Vous devez voir :

- société
- prospect
- caller
- commercial assigné
- date
- raison d’assignation
- historique

Ce qu’il faut comprendre :

- la supervision ne doit pas seulement montrer “ce qui existe”
- elle doit aussi montrer **pourquoi** l’attribution a été faite

La zone `Raison d’assignation` est là pour ça.

### Étape 4 : changer le statut

Depuis le détail, testez plusieurs statuts :

- `completed`
- `no_show`
- `cancelled`
- `rescheduled`
- `not_qualified`

Ajoutez éventuellement une note dans le champ `Motif / note admin`.

Ce qu’il faut vérifier :

- le statut change
- l’historique ajoute une nouvelle entrée
- la liste admin se met à jour

Ce test est critique car il couvre le besoin exprimé pendant l’onboarding :

- garder la trace de la vie du rendez-vous
- ne pas écraser l’historique

---

## 7. Scénarios métier à tester absolument

### Scénario A : booking simple

Objectif :

- valider le parcours nominal

À faire :

1. Choisir un caller
2. Choisir une société < 200
3. Choisir un créneau
4. Réserver
5. Vérifier que le booking apparaît dans l’admin

### Scénario B : booking senior-only

Objectif :

- valider la règle de qualification

À faire :

1. Choisir une société >= 200
2. Réserver un créneau
3. Aller dans l’admin
4. Vérifier dans le détail que le pool retenu est `senior`

### Scénario C : no-show / annulation

Objectif :

- valider la supervision post-rendez-vous

À faire :

1. Ouvrir un booking dans l’admin
2. Le passer en `no_show` ou `cancelled`
3. Vérifier que l’historique garde la transition

### Scénario D : live slots

Objectif :

- valider l’expérience “Doctolib-like”

À faire :

1. Ouvrir deux onglets
2. Réserver depuis le premier
3. Observer le second

---

## 8. Ce qu’il faut retenir quand vous “comprenez” le MVP

Si le MVP est compris correctement, vous devez pouvoir expliquer le produit ainsi :

- Be Nice ne veut pas juste voir des agendas
- Be Nice veut posséder le **hub de booking**
- le caller travaille avec un seul lien par client
- le système consolide les dispos de plusieurs commerciaux
- le système choisit automatiquement le bon commercial
- l’admin voit ensuite la totalité du cycle de vie du rendez-vous

Si, en testant, vous avez l’impression d’utiliser :

- un agenda personnel amélioré
ou
- un simple tableau de rendez-vous

alors vous passez à côté du point principal.

Le cœur du MVP, c’est :

- `booking consolidé`
- `routing métier`
- `supervision post-booking`

---

## 9. Limitations actuelles à garder en tête

Pendant vos tests, gardez aussi en tête ce qui est **hors scope** ou encore simplifié :

- un seul client seedé
- pas de vrai onboarding client
- pas de vraie auth métier
- pas de Pipedrive branché
- pas de Nylas réel branché par défaut sans variables d’environnement
- pas de pages self-service d’annulation/reprogrammation
- pas de robustesse production complète autour des webhooks provider

Donc si vous voyez ces manques, c’est normal.

Le bon angle de lecture est :

- est-ce que le cœur du produit est prouvé ?

et pas :

- est-ce que tout le SaaS final est déjà là ?

---

## 10. Checklist courte de validation

Si vous voulez une version ultra rapide de la recette :

1. Ouvrir `/`
2. Ouvrir `/book/teamstarter-discovery`
3. Choisir `Clotilde`
4. Choisir une société `< 200`
5. Réserver un créneau
6. Vérifier le booking dans `Rendez-vous du caller`
7. Ouvrir `/admin/bookings`
8. Retrouver le booking
9. Ouvrir le détail
10. Changer le statut
11. Vérifier que l’historique s’est enrichi
12. Refaire un test avec une société `>= 200`
13. Vérifier que l’assignation est cohérente avec un pool senior

Si ces 13 points passent, le MVP est sur la bonne trajectoire.
