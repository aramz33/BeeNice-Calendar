---
tags: [agents, projet/beeniche, nylas, microsoft, google, auth]
project: BeeNice Calendar
topic: Brief Julien — mise en prod auth calendriers
created: 2026-06-24
updated: 2026-06-24
---

# Brief Julien — connexion des calendriers en production (Google + Microsoft)

> Note à lire à Julien. Sujet : ce que **BeeNice** doit fournir/faire côté Google et
> Microsoft pour que les commerciaux puissent connecter leur agenda en vrai.
> Sources vérifiées (Microsoft Learn, Google Developers) — voir bas de note.

## En une phrase

La partie « technique » BeeNice est faite. Ce qui reste, ce sont des **validations
imposées par Google et Microsoft eux-mêmes** (sécurité, anti-apps-pirates) — on ne
peut pas les contourner. Bonne nouvelle : pour le **1er client Cozy RH (Microsoft),
c'est léger et rapide**. Google, c'est plus lourd, mais **pas bloquant pour Cozy RH**.

---

## Priorité : ce qui bloque vraiment juillet

| Provider | Bloque le lancement Cozy RH (juillet) ? | Effort | Délai |
|---|---|---|---|
| **Microsoft** | ✅ OUI — Cozy RH est sur Microsoft | **Léger** | Jours |
| **Google** | ❌ NON — utile seulement pour un futur client sur Google Workspace | Lourd | Semaines |

→ **À faire maintenant : Microsoft.** Google se lance **en parallèle**, sans stresser
sur juillet.

---

## 1. Microsoft — pour Cozy RH (le chemin critique, mais simple)

Il y a **2 choses distinctes** — ne pas les confondre :
- **A. Consentement admin** = **OBLIGATOIRE et SUFFISANT** pour que Cozy RH marche.
- **B. Vérification éditeur** (badge bleu) = **OPTIONNEL**. Confort + image, **pas requis** pour Cozy RH.

**Légende propriété :** 🟢 **Adam** (technique, seul) · 🟡 **Ensemble** (BeeNice fournit
un asset/une décision, Adam exécute) · 🔵 **BeeNice** (eux seuls peuvent le faire).

### Que se passe-t-il SANS vérification éditeur ? (en clair, au-delà du « warning »)
Pour notre app (multi-tenant, demande l'agenda d'utilisateurs d'autres entreprises) :
- ❌ **Un commercial ne peut PAS connecter son agenda tout seul.** Microsoft bloque
  l'auto-autorisation d'une app non vérifiée (règle par défaut depuis nov. 2020). Le
  commercial voit *« approbation administrateur requise »* et est bloqué.
- ✅ **MAIS si l'admin IT du client a validé l'app une fois (= consentement admin),
  tout fonctionne** — les commerciaux connectent ensuite sans rien voir de spécial.
- ⚠️ L'admin qui valide voit, lui, un **avertissement « éditeur non vérifié,
  application risquée »**.
- **Donc, concrètement, sans vérification :** (1) **chaque** client doit passer par
  son admin IT — pas d'auto-service par les commerciaux ; (2) cet admin voit un
  avertissement. **Rien d'autre ne casse.**
- **Avec vérification :** plus d'avertissement, et les commerciaux peuvent se
  connecter seuls (selon la politique du client) → **plus de passage admin
  obligatoire à chaque client**. C'est purement un gain de friction pour **scaler**.

➡️ **Pour Cozy RH (1 client, on passe de toute façon par leur IT) : la vérification
n'apporte rien d'indispensable. Le consentement admin suffit.**

### Permissions demandées (rien d'autre — ni mails, ni fichiers, ni contacts, ni annuaire)
```
openid · profile · User.Read        → identifier le commercial connecté
offline_access                       → garder la connexion sans re-signer chaque jour
Calendars.ReadWrite                  → lire les dispos + créer/annuler les RDV
Calendars.ReadWrite.Shared           → (optionnel — agendas partagés ; retirable si l'IT trouve ça trop large)
```

### Procédure A — Faire marcher Cozy RH (OBLIGATOIRE, pour juillet)
1. 🟢 **Adam** génère l'URL de consentement admin (avec le client ID Azure).
2. 🔵 **BeeNice/Julien** envoie à l'IT de Cozy RH la demande + l'URL — *Adam n'a pas
   le contact Cozy*. Mail prêt → [[nylas-microsoft-oauth/08 - Gerer le consentement admin client]].
3. 🔵 **L'admin Microsoft 365 de Cozy RH** clique « Accepter » → tout le tenant
   autorisé, une fois. (Ce n'est **pas** « donnez-nous un accès admin » : l'app agit
   ensuite uniquement avec le compte de chaque commercial.)
4. 🟢 **Adam** teste la connexion d'un vrai commercial Cozy RH.

➡️ **Ça suffit. Inutile d'attendre la vérification éditeur pour juillet.**

### Procédure B — Vérification éditeur (OPTIONNEL, à faire avant de scaler)
**L'objectif en une phrase :** faire reconnaître officiellement **BeeNice** par
Microsoft comme l'éditeur de confiance de l'application — c'est le **badge bleu
« Vérifié »** que voient les clients. En pratique : faire valider l'identité de
l'entreprise BeeNice par Microsoft, puis la relier à l'application.

> **Condition de départ indispensable** 🔵 : l'application doit appartenir à
> **l'entreprise BeeNice**, pas à un compte personnel ou d'école. Il faut donc que
> BeeNice ait **son propre compte Microsoft professionnel** et **son propre nom de
> domaine internet** (ex. `beenice.fr`). ⚠️ Lancée depuis un compte d'école, la
> démarche afficherait l'**école** comme éditeur, pas BeeNice — à éviter.

1. 🔵 **BeeNice — préparer l'identité.** Confirmer le compte Microsoft professionnel
   et le nom de domaine BeeNice qui serviront d'identité officielle.
2. 🟡 **Inscrire BeeNice au programme partenaire Microsoft (gratuit) et faire vérifier
   son identité.** Microsoft contrôle que BeeNice est une entreprise réelle (proche
   d'un contrôle d'identité / KYC) et délivre un **numéro de partenaire officiel**.
   *C'est la seule étape qui demande de l'attente.* L'identité est celle de BeeNice ;
   Adam peut piloter la partie administrative si on lui en donne l'accès.
3. 🟢 **Adam — relier le domaine BeeNice à l'application**, pour que Microsoft constate
   que l'application et l'entreprise correspondent.
4. 🟡 **Vérifier les droits d'accès** de la personne qui finalise (côté application et
   côté compte partenaire), avec double-authentification activée — formalité de sécurité.
5. 🟢 **Adam — finaliser** : saisir le numéro de partenaire BeeNice dans l'application
   et valider → le **badge bleu « Vérifié »** apparaît.

*(Détail technique exact des manipulations Microsoft : pris en charge par Adam.)*

**Coût : 0 €.** Une fois l'identité BeeNice validée (étape 2), la pose du badge est
quasi immédiate.

**⏱ Combien de temps :**
- **Étape 1 — identité BeeNice prête** : **immédiat** si le compte pro + le domaine
  existent déjà ; **1 à 3 jours** s'il faut les créer.
- **Étape 2 — vérification de l'entreprise par Microsoft** : **2 à 5 jours ouvrés** en
  général, **jusqu'à ~2 semaines** si Microsoft réclame des justificatifs. ⟵ *le seul
  vrai délai, et il dépend de Microsoft, pas de nous.*
- **Étapes 3 à 5 — relier et poser le badge** : **~15 minutes**, le jour même.
- **Total réaliste : 3 jours à 2 semaines**, essentiellement de l'attente. Temps de
  travail réel cumulé (BeeNice + Adam) : **moins d'1 heure.**

---

## 2. Google — plus lourd, mais PAS pour juillet

À faire **uniquement quand un client utilisera Google Workspace** (Cozy RH = Microsoft,
donc pas concerné). À lancer en parallèle car c'est long.

**Pourquoi c'est imposé :** pour donner accès aux agendas Google, Google exige de
**publier l'app et passer leur vérification** (les agendas = « périmètre sensible »).
Sinon : en mode test, les agendas **se déconnectent tous les 7 jours** et c'est plafonné
à 100 utilisateurs → inutilisable en vrai. **Ce n'est pas notre choix, c'est la règle
Google.**

**Ce dont j'ai besoin de BeeNice (et pourquoi je ne peux pas le faire seul) :**

| À fournir | Qui | Note |
|---|---|---|
| **URL du site BeeNice** (la page d'accueil suffit) | BeeNice | doit être en ligne, sur un domaine BeeNice |
| **Page « politique de confidentialité »** en ligne | BeeNice | ⚠️ **le point lent** : contenu légal, à rédiger/valider |
| **Accès DNS du domaine** | **Corentin** | il ajoute 1 enregistrement TXT que je lui donne (5 min) ; moi je valide ensuite |
| **Logo + email de support** | BeeNice | actifs de marque |

**Côté Adam :** toute la config technique Google + la soumission + une **vidéo démo**
du flux. Bon point : les agendas étant « sensibles » et non « restreints »,
**pas d'audit sécurité tiers payant (CASA)** — juste la revue + vidéo.

**⏱ Délais Google :**
- Préparation BeeNice : **site + logo + email = rapide** ; **politique de
  confidentialité = le point lent** (rédaction/validation juridique, **quelques jours
  à 1–2 semaines** selon qui l'écrit).
- Vérification DNS du domaine (Corentin ajoute le TXT, Adam valide) : **quelques
  heures** (propagation DNS).
- Config + soumission + vidéo (Adam) : **~1 demi-journée**.
- **Revue Google (scopes sensibles)** : **~2 à 6 semaines**, parfois plus selon les
  allers-retours — délai **non maîtrisé**, côté Google.
- **Total réaliste : 3 à 7 semaines**, dominé par (a) la rédaction de la politique de
  confidentialité et (b) la revue Google. ⟵ **d'où l'intérêt de lancer tôt**, même si
  Cozy RH (Microsoft) n'en dépend pas.

---

## Ce qu'il faut retenir / les demandes concrètes

1. **Microsoft (urgent, Cozy RH)** : Julien fait remonter à l'IT de Cozy RH la demande
   d'**autoriser l'app BeeNice Calendar** (consentement admin). Permissions = agenda +
   profil seulement. → débloque le test/lancement.
2. **Microsoft (avant de scaler)** : valider que l'app Azure est dans un tenant pro
   BeeNice + domaine BeeNice, puis faire la **vérification éditeur (gratuite)**.
3. **Google (en parallèle, pas bloquant juillet)** : BeeNice fournit **site + politique
   de confidentialité + accès DNS (Corentin) + logo/email support**. Le reste, je le porte.

**Le message à faire passer :** ces étapes sont **une fois pour toutes**, **imposées
par Google/Microsoft** (sécurité), pas du dev en plus. La seule qui demande de
l'anticipation, c'est la **politique de confidentialité** (juridique) + la validation
Google (lente) — donc autant lancer Google tôt même si Cozy RH n'en dépend pas.

---

### Sources (vérifiées 2026-06-24)
- Microsoft — Consentement utilisateur/admin : <https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/user-admin-consent-overview>
- Microsoft — Vérification éditeur (badge, gratuit, prérequis, blocage apps non vérifiées depuis nov. 2020) : <https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview>
- Nylas — Permissions Graph Azure (calendrier) : <https://developer.nylas.com/docs/provider-guides/microsoft/create-azure-app/>
- Google — Vérification scopes sensibles (agenda) : <https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification>
- Runbook interne : [[microsoft-enterprise-auth]] · [[nylas-microsoft-oauth/08 - Gerer le consentement admin client]] · [[nylas-microsoft-oauth/05 - Configurer les permissions Graph]]
- Doc repo Google prod : `docs/google-oauth-production-setup.md`
