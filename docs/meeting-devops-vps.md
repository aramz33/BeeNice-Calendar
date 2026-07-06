# Meeting DevOps — Déploiement VPS BeeNice Calendar

## 0. Glossaire (à lire avant, pour ne pas être perdu)

| Terme | Définition |
|---|---|
| **VPS** (Virtual Private Server) | Serveur loué chez un hébergeur (ici Hostinger) sur lequel on installe et fait tourner l'app nous-mêmes — par opposition à un service tout-géré (Vercel, Heroku). |
| **Backend** | La partie serveur (logique métier, base de données, API). S'oppose au frontend. |
| **Frontend** | La partie affichée dans le navigateur (React). Après `build`, ce sont juste des fichiers HTML/JS/CSS statiques. |
| **API** | L'interface par laquelle le frontend parle au backend (ex : "récupère les créneaux dispo"). |
| **Node.js** | L'environnement d'exécution du backend (JavaScript côté serveur). "Node 24" = la version requise. |
| **npm** | Le gestionnaire de paquets/scripts de Node (`npm run build`, `npm start`, etc.). |
| **Build** | L'étape qui transforme le code source en fichiers prêts pour la prod (optimisés, minifiés). |
| **SQLite** | Base de données qui vit dans **un seul fichier** sur le disque, pas un serveur à part (contrairement à Postgres/MySQL). Simple à opérer, mais ce fichier doit être sauvegardé comme n'importe quelle donnée critique. |
| **Module natif / compilation à l'install** | `better-sqlite3` (la lib qui pilote SQLite) contient du code C compilé spécifiquement pour l'OS/l'architecture du serveur au moment de `npm install`. Implication concrète : ça doit être installé/compilé sur le même type de machine que celle qui fera tourner l'app (ou dans l'image Docker), pas juste copié depuis mon Mac. |
| **Nylas** | Service tiers qui connecte l'app aux calendriers Google/Microsoft des sales reps (gère l'auth OAuth + lecture/écriture des créneaux). On ne parle pas directement à Google/Microsoft, on passe par Nylas. |
| **OAuth** | Protocole standard qui permet à un utilisateur d'autoriser une app à accéder à son compte (ici : son calendrier) sans donner son mot de passe. |
| **Callback URL** | Adresse publique vers laquelle Google/Microsoft/Nylas redirige l'utilisateur une fois l'accès autorisé. Doit être une URL **publique et HTTPS** enregistrée à l'avance chez Nylas — donc il faut le domaine final avant de configurer ça. |
| **SSE** (Server-Sent Events) | Canal permanent ouvert entre le navigateur et le serveur, utilisé ici pour pousser en temps réel "ce créneau vient d'être pris" vers tous les onglets ouverts. Un reverse proxy mal configuré peut couper ce canal (d'où la question sur `proxy_buffering`). |
| **Reverse proxy** | Serveur intermédiaire (nginx, Caddy, Traefik...) placé devant l'app, qui reçoit tout le trafic public sur le port 443 (HTTPS) et le redirige en interne vers le port de l'app (8787). Gère aussi le certificat HTTPS. |
| **HTTPS / certificat SSL-TLS** | Chiffrement du trafic web. Nécessite un certificat, généralement obtenu automatiquement via Let's Encrypt (certbot) ou géré par Cloudflare/Caddy. |
| **DNS** | L'annuaire qui fait correspondre un nom de domaine (ex : `app.beenice.com`) à l'adresse IP du VPS. Un enregistrement **TXT** est un type d'entrée DNS utilisé ici pour prouver à Google qu'on possède le domaine (vérification d'app, pas pour le routage). |
| **Docker / conteneur** | Manière d'empaqueter l'app (code + dépendances + config) dans une unité isolée et reproductible, qui tourne pareil sur n'importe quelle machine. Alternative : installer Node directement sur le VPS ("bare metal"). |
| **Process manager** (systemd, pm2) | Mécanisme qui garde l'app démarrée en arrière-plan et la relance automatiquement si elle crashe ou si le serveur redémarre. Sans ça, un crash = app down jusqu'à intervention manuelle. |
| **Variable d'environnement** | Valeur de config (mot de passe, clé API, URL...) injectée au serveur au démarrage plutôt qu'écrite en dur dans le code — c'est comme ça que les secrets sont transmis à l'app. |
| **Secret** | Donnée sensible (clé API, mot de passe) qui ne doit jamais être dans le code ni dans git. `BETTER_AUTH_SECRET` par exemple sert à signer/chiffrer les sessions utilisateur. |
| **Staging** | Environnement de test identique à la prod mais séparé, pour valider un déploiement avant de le pousser en prod réelle. |
| **Single instance** | Une seule copie de l'app tourne à la fois (pas de répartition de charge sur plusieurs serveurs). Contrainte ici à cause de SQLite (un seul fichier) et du SSE (connexions temps réel en mémoire sur une seule instance). |
| **n8n** | Outil d'automatisation (no-code) que Corentin utilise pour faire le pont entre Google Sheets et Pipedrive — potentiellement hébergé sur le même VPS. |

## 1. La stack à présenter (2 min)

- **App** : outil B2B de booking (callers BeeNice bookent des RDV sur les calendriers des sales reps clients). Premier client : Cozy RH (Microsoft). **Cible v0 : maintenant (début juillet).**
- **Backend** : Node.js **24.x obligatoire** (`engines` strict), serveur Hono (`npm start` → port **8787**, configurable `MVP_API_PORT`).
- **Frontend** : React 18 + Vite → build statique (`npm run build` → `mvp/dist`).
- **Base de données** : **SQLite fichier** (`better-sqlite3`, module natif) — pas de serveur DB à installer, mais un **fichier à persister et sauvegarder** (`MVP_DB_PATH`, + fichiers WAL à côté).
- **Calendriers** : Nylas (OAuth hébergé Google + Microsoft) — nécessite une **callback URL publique HTTPS** enregistrée chez Nylas.
- **Temps réel** : **SSE** (Server-Sent Events) pour invalider les créneaux entre onglets → contrainte reverse proxy (voir §3).
- **Auth** : better-auth, sessions en DB.
- **Tests** : 218 backend + 40 web, verts.

### Variables d'environnement prod
```
BETTER_AUTH_SECRET      (openssl rand -base64 32 — à provisionner)
BETTER_AUTH_URL         (URL publique de l'app)
MVP_CALENDAR_PROVIDER=nylas
MVP_NYLAS_API_KEY
MVP_NYLAS_CLIENT_ID
MVP_NYLAS_CALLBACK_URL  (https://<domaine>/api/admin/integrations/nylas/callback)
MVP_DB_PATH             (chemin du fichier SQLite sur volume persistant)
MVP_API_PORT            (défaut 8787)
```

## 2. Questions à lui poser (le cœur du meeting)

### Packaging & livraison
1. **Format de livraison attendu ?** Docker (Dockerfile + compose) ou déploiement direct Node sur le VPS ? *(Corentin a mentionné du conteneur — confirmer.)*
2. **Comment se passent les mises à jour ?** git pull + build sur le VPS ? Image Docker poussée sur un registre ? Qui déclenche, à quelle fréquence ?
3. Y a-t-il un **environnement de staging** avant la prod, ou prod directe ?

### Infra & réseau
4. **Quel domaine / sous-domaine** pour l'app ? Qui gère le DNS ? *(J'aurai aussi besoin plus tard d'un enregistrement TXT pour la vérification Google OAuth.)*
5. **HTTPS** : qui gère les certificats (Caddy, nginx + certbot, Cloudflare) ?
6. **Reverse proxy** : lequel ? ⚠️ L'app utilise du **SSE** → il faut `proxy_buffering off` (nginx) et des timeouts longs sur les connexions, sinon les mises à jour temps réel cassent.
7. L'app tourne sur le **même VPS que le n8n** de Corentin ? Quelles ressources (RAM/CPU/disque) ?
8. Ports exposés : idéalement **seul 443 public**, l'API 8787 reste derrière le proxy.

### Données & exploitation
9. **Backups** : quelle stratégie pour le fichier SQLite ? Fréquence, rétention, où, test de restore ? *(C'est LA donnée métier — bookings clients.)*
10. **Secrets** : comment sont-ils provisionnés ? Fichier `.env` sur le serveur, secret manager ? Qui y a accès ?
11. **Process manager / redémarrage** : systemd, pm2, Docker restart policy ? L'app doit redémarrer seule après crash/reboot.
12. **Logs** : où vont-ils, rotation, comment je les consulte pour débugger ?
13. **Monitoring / alerting** : uptime check ? Qui est prévenu si ça tombe ?

### Accès & responsabilités
14. **Ai-je un accès SSH** au VPS (ou accès aux logs/console) pour débugger en prod ?
15. Qui fait quoi : lui = infra, moi = app ? Canal de contact pour les incidents ?
16. **Timing** : quand peut-il déployer une fois que je livre ? (cible v0 = début juillet, repli 7 juillet)

## 3. Remarques / contraintes à lui signaler

- **Single instance obligatoire** : SQLite + SSE en mémoire → **une seule instance de l'app**, pas de load balancing multi-instances. Largement suffisant pour v0.
- **Module natif** : `better-sqlite3` compile à l'install → si Docker, tout se fait au build de l'image ; si install directe, Node 24 + toolchain build requis (`npm run rebuild:native` existe).
- **Bug timezone corrigé** : les créneaux sont désormais ancrés Europe/Paris quel que soit le TZ du serveur → **le VPS peut rester en UTC**, aucun réglage TZ nécessaire.
- **Callback Nylas** : je dois enregistrer l'URL publique finale dans le dashboard Nylas **avant** le go-live → il me faut le domaine dès que possible.
- **Seed de démo** : au premier démarrage sur DB vide, l'app seed des données de démo. À gérer pour la prod (je m'en occupe côté code) — mais le fichier DB prod ne doit **jamais** être supprimé (= perte des bookings).
- ⚠️ Côté moi, avant livraison (à annoncer, pas à lui demander) :
  - merger le fix TZ (branche `fix/availability-paris-tz`, prête)
  - fail-fast si `BETTER_AUTH_SECRET` absent (sécu, en TODO)
  - écrire `docs/DEPLOIEMENT.md` avec ses réponses d'aujourd'hui (T6)

## 4. Infos à repartir avec (checklist fin de meeting)

- [ ] Format de packaging décidé (Docker oui/non)
- [ ] Domaine + qui gère DNS et HTTPS
- [ ] Reverse proxy choisi + OK sur la contrainte SSE
- [ ] Stratégie backup SQLite actée
- [ ] Méthode de provisionnement des secrets
- [ ] Process de mise à jour (qui, comment)
- [ ] Mon niveau d'accès (SSH / logs)
- [ ] Date de déploiement visée
- [ ] Son canal de contact
