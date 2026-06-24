---
tags: [agents, projet/beeniche, nylas, microsoft, azure, integration]
project: BeeNice Calendar
topic: Microsoft Enterprise Auth
created: 2026-06-02
---

# Nylas Issues Microsoft - Index

Objectif de ce dossier : te guider pas a pas pour debloquer l'authentification Microsoft Enterprise de BeeNice Calendar via Nylas.

Le probleme a resoudre : les comptes Microsoft personnels peuvent fonctionner, mais les comptes professionnels Microsoft 365 / Entra ID peuvent bloquer sur le consentement administrateur ou sur une configuration Azure/Nylas incorrecte.

## Etat actuel connu

- Plan Nylas Calendar achete.
- Nouvelle app Nylas creee : BeeNiceCal.
- Environnement Nylas utilise : Production.
- Prochaine vigilance : ne pas melanger BeeNiceCal Production avec une ancienne app sandbox ou des anciennes cles.

## Ordre de lecture

1. [[01 - Comprendre le flux OAuth]]
2. [[02 - Verifier les plans gratuits et payants]]
3. [[03 - Choisir region URLs et environnement]]
4. [[04 - Creer l application Microsoft Entra]]
5. [[05 - Configurer les permissions Graph]]
6. [[06 - Configurer le connecteur Microsoft dans Nylas]]
7. [[07 - Configurer BeeNice et les variables env]]
8. [[08 - Gerer le consentement admin client]]
9. [[09 - Tester avec un rep Microsoft]]
10. [[10 - Diagnostiquer les erreurs frequentes]]
11. [[11 - Checklist production]]

## Regle senior

Ne change jamais plusieurs choses a la fois.

Pour chaque test, note :
- compte teste
- tenant Microsoft teste
- region Nylas
- callback utilise
- message d'erreur exact
- etat en base de donnees

Sans ces traces, OAuth devient rapidement impossible a diagnostiquer.

## References projet

- Issue Obsidian : [[microsoft-enterprise-auth]]
- Note projet : [[overview]]
- Architecture : [[ARCHITECTURE]]
- Specs : [[functional-spec]]

## References officielles

- Nylas - Create an Azure auth app : https://developer.nylas.com/docs/provider-guides/microsoft/create-azure-app/
- Nylas - Hosted OAuth API key : https://developer.nylas.com/docs/v3/auth/hosted-oauth-apikey/
- Nylas - Microsoft admin approval : https://developer.nylas.com/docs/provider-guides/microsoft/admin-approval/
- Microsoft - Admin consent endpoint : https://learn.microsoft.com/en-us/entra/identity-platform/v2-admin-consent
- Microsoft Graph permissions : https://learn.microsoft.com/en-us/graph/permissions-reference
- Nylas pricing : https://www.nylas.com/pricing/
- Microsoft Entra pricing : https://www.microsoft.com/en-us/security/business/microsoft-entra-pricing
