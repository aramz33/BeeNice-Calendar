Voilà le tableau complet avec les réponses :

---

**Round Robin**

| Question | Réponse |
|---|---|
| Est-ce qu'on garde bien un système de round robin ? | OUI |
| Pour les clients en pool unique, répartition équilibrée/aléatoire avec historique ? | C'est le client qui décide. Par défaut répartition équitable, on peut modifier l'un et les autres s'ajustent pour former 100% au total |
| Pondération par rôle (ex. senior 80% / junior 20%) ? | NON — c'est le client qui choisit le pourcentage |
| Document spécificités fonctionnelles round robin ? | Possibilité en fonction du nombre de callers et le pourcentage à attribuer *(réponse tronquée)* |

**Création client**

| Question | Réponse |
|---|---|
| Champs lors de la création d'un client ? | Nom entreprise, Nom contact principal, Téléphone, Email, Nombre de reps (modifiable), % routing par rep (équitable par défaut, recalcul automatique si modifié, total = 100%) |

**Workflow de repositionnement**

| Question | Réponse |
|---|---|
| Assignation manuelle ou automatique via Google Sheet ? | LES DEUX |
| Si automatique : même caller ou autre système ? | Toujours réassigner au même caller |
| Centre de notifications côté admin ou caller ? | ADMIN ET CALLER |

**Statuts des rendez-vous**

| Question | Réponse |
|---|---|
| Quels statuts ? | Honoré, No-show, Non qualifié, Annulé, MVN (Mauvais numéro), Refus |
| Qui met à jour les statuts ? | Admin (interface) ✓ — Google Sheet ✓ (flux Pipedrive/Sheet à voir) — CRM client (hors périmètre contrat actuel) — Autre source |

**Microsoft Azure** — *(pas de réponse)*

**Google Sheets**

| Question | Réponse |
|---|---|
| Structure exacte du Google Sheet ? | [Lien Drive partagé](https://docs.google.com/spreadsheets/d/1nom9ywiN7NFhVGUPZZ15ZWcqlkIR66D2xTsdZ8vbV0Q/edit?usp=sharing) |

**Admin vs Non-Admin**

| Question | Réponse |
|---|---|
| 2 accès séparés (admin + caller) ? | OUI |

---

Tu veux que je fasse quelque chose avec ça — doc Word, spec technique, autre ?