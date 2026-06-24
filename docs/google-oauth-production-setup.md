# Google OAuth — Production setup (Nylas, EU region)

End-to-end guide to take BeeNice's Google calendar connection from **Testing**
(only allowlisted testers, refresh tokens die after 7 days) to **published +
verified** (any client rep can connect, permanently).

For the quick "unblock one tester right now" path, see
[`google-oauth-403.md`](./google-oauth-403.md). **This** doc is the real,
one-time production setup.

> **Why you must do this, not just add test users:** while the app is in Testing
> mode, Google expires the OAuth **refresh token after 7 days** for sensitive
> scopes — every connected rep calendar silently disconnects weekly. Testing
> mode is also capped at **100 test users**. Only a *published + verified* app
> gives permanent, unlimited connections.

---

## 0. Key facts for BeeNice (read first)

| Thing | Value |
|---|---|
| Nylas region | **EU** (RGPD) |
| Nylas provider callback (goes in Google) | `https://api.eu.nylas.com/v3/connect/callback` |
| Nylas app | **BeeNiceCal Production** |
| BeeNice app callback (stays in Nylas) | `/api/admin/integrations/nylas/callback` on the BeeNice origin |
| Scope class for Calendar | **Sensitive** → verification required, **no** CASA security assessment |
| Google client used | **BeeNice-owned** OAuth client (NOT Nylas' shared app) |

**Scopes (exact, copyable):**
```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/calendar
```

### Prerequisites — gather BEFORE you start (verification stalls without them)
- [ ] Access to the **Google Cloud project** that owns the BeeNice OAuth client.
- [ ] A **homepage URL** and a **privacy policy URL** on a **domain BeeNice owns**.
- [ ] That domain **verified in [Google Search Console](https://search.google.com/search-console)**
      (you cannot verify `nylas.com` — see the caveat in §8).
- [ ] App **logo** (120×120 px, PNG/JPG), a **support email**, a **developer
      contact email**.

> ⚠️ Google revamped this UI. The old "APIs & Services → OAuth consent screen"
> single page is now the **"Google Auth Platform"** with separate left-nav pages:
> **Overview · Branding · Audience · Clients · Data Access · Verification Center**.
> Screens below use the new names.

---

## 1. Project + enable the Calendar API

1. [Google Cloud Console](https://console.cloud.google.com) → top bar project
   picker → select the existing BeeNice project (or **New Project**).
2. Left **Menu (☰) → APIs & Services → Library**.
3. Search **Google Calendar API** → open it → **Enable**.
   - That's the only API the booking flow needs. (Gmail/People/Admin SDK are for
     email/contacts use cases — **skip** them.)

---

## 2. Google Auth Platform → Branding

1. **Menu (☰) → Google Auth Platform** (search "Google Auth Platform" if not
   visible). If nothing is configured yet, click **Get started**.
2. **App Information**: **App name** = `BeeNice Calendar`, **User support email**
   = your support address → **Next**.
3. **Audience**: choose **External** (client reps are outside your Google org) →
   **Next**.
4. **Contact Information**: developer email for Google's notifications → **Next**.
5. **Finish**: tick *"I agree to the Google API Services: User Data Policy"* →
   **Continue** → **Create**.
6. Back in **Branding**, fill the rest and **Save**:
   - **App logo** (uploading a logo is itself part of what triggers verification —
     expected).
   - **App home page**: your BeeNice homepage URL.
   - **Privacy policy URL**: your privacy page.
   - **Authorized domains**: add **two** entries —
     - `nylas.com` (the redirect host), and
     - your **own** domain (the one hosting homepage + privacy).

---

## 3. Data Access → add scopes

1. Google Auth Platform → **Data Access** → **Add or remove scopes**.
2. The Calendar scopes won't appear in the picker list until the Calendar API is
   enabled (§1). Either tick `.../auth/calendar` in the table or paste into
   **"Manually add scopes"**:
   ```text
   openid
   https://www.googleapis.com/auth/userinfo.email
   https://www.googleapis.com/auth/userinfo.profile
   https://www.googleapis.com/auth/calendar
   ```
3. **Update** → **Save**. `…/auth/calendar` will be flagged **Sensitive** — correct.
   - Do **not** add `calendar.events` on top of `calendar` (redundant).
     `calendar.event` (singular) is **not a real scope**.

---

## 4. Clients → create the OAuth client

1. Google Auth Platform → **Clients** → **Create client** (or Menu → APIs &
   Services → **Credentials** → **Create credentials → OAuth client ID**; same
   thing).
2. **Application type**: **Web application**.
3. **Name**: `BeeNice Calendar – Nylas EU`.
4. **Authorized redirect URIs** → **Add URI** →
   ```text
   https://api.eu.nylas.com/v3/connect/callback
   ```
   - **Exact**: `https` (not http), region `eu`, no trailing slash. A stray slash
     or `us`/`eu` mismatch is the #1 cause of `redirect_uri_mismatch`.
5. **Create**. Copy the **Client ID** and **Client secret** into your secrets
   manager immediately (the secret is shown once).

---

## 5. Put the credentials into Nylas

1. Nylas dashboard → app **BeeNiceCal Production** → **Connectors → Google**.
2. Set **Client ID** and **Client secret** to the values from §4 (this replaces
   any shared/default Nylas Google app, so the consent screen shows **your**
   verified app, not `nylas.com`).
3. Confirm the connector **scopes** match §0.
4. *(Optional, Nylas support access)* In Google Cloud **IAM & Admin → IAM**, you
   may add Nylas' support service account as **Owner** if Nylas asks during a
   support ticket. Not required for normal operation.

**Sanity check before publishing:** with yourself added as a test user (Audience →
Test users → Add users), run the real BeeNice rep link end to end. The consent
screen should show **BeeNice Calendar** (not nylas.com) and land back on
`/api/admin/integrations/nylas/callback`. If it still says nylas.com, the
connector is still on shared credentials — fix §5.2.

---

## 6. Publish

1. Google Auth Platform → **Audience**.
2. Under **Publishing status** (currently *Testing*) → **Publish app** → confirm
   **Prepare for verification**.
3. Status becomes **In production**. The app now works for everyone but shows an
   **"unverified app"** interstitial until §7 clears.

---

## 7. Submit for verification (sensitive scopes)

Because `…/auth/calendar` is sensitive, Google requires verification. There is
**no CASA third-party security assessment** for sensitive scopes (that's only for
*restricted* scopes like Gmail/Drive) — so this is brand + scope review + a video.

1. Google Auth Platform → **Verification Center** (or you'll get an email link
   after publishing) → **Prepare for verification / Submit for verification**.
2. Provide:
   - **Scope justification**: per scope, why BeeNice needs it. For
     `…/auth/calendar`: *"Read reps' availability and create/cancel discovery
     meetings on their calendar; full read/write is required to manage events
     BeeNice books."*
   - **Demo video** (unlisted YouTube link): record the **live** flow — open the
     BeeNice rep link, click connect, show the Google consent screen with the
     OAuth client, grant, and show a calendar event being created. Narrate how
     each scope is used.
   - Confirm homepage + privacy policy are reachable on the **verified** domain.
3. **Submit**, then **watch the developer-contact inbox** — Google replies there
   and the clock pauses on every question. Reply within a day or two.

**Timeline:** a few days to several weeks depending on Google's back-and-forth.
Start now if the target is the July go-live.

---

## 8. The one unavoidable caveat (authorized domain ownership)

Google verifies **authorized domains** via Search Console ownership. You **cannot**
verify `nylas.com` because BeeNice doesn't own it. In practice:

- Your **own** verified domain (homepage + privacy) satisfies the ownership
  requirement.
- `nylas.com` is accepted as a **known redirect host** — Nylas is your OAuth
  provider, and reviewers see this pattern constantly.
- If a reviewer questions the `nylas.com` redirect, reply that **Nylas is the
  hosted OAuth/calendar provider** and the redirect terminates at Nylas before
  returning to the BeeNice app callback (`/api/admin/integrations/nylas/callback`).

This friction is inherent to using a hosted provider; it is **not** something you
can configure away in the console.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Erreur 403: access_denied`, "nylas.com n'a pas terminé la validation" | App in Testing **or** connector on shared Nylas app | Add tester (Audience → Test users), or finish §5–§7 → see [`google-oauth-403.md`](./google-oauth-403.md) |
| `redirect_uri_mismatch` | Redirect URI typo / wrong region | §4: exact `https://api.eu.nylas.com/v3/connect/callback`, no slash, `eu` not `us` |
| Consent screen shows **nylas.com** as the app | Connector using shared credentials | §5.2 — set BeeNice client ID/secret in the Google connector |
| Calendars disconnect every ~7 days | App still in **Testing** | Publish + verify (§6–§7); the 7-day refresh-token cap only applies in Testing |
| Calendar scopes missing from the scope picker | Calendar API not enabled | §1 — enable Google Calendar API, then revisit Data Access |

## Done checklist
- [ ] Google Calendar API enabled
- [ ] Branding complete (logo, homepage, privacy, authorized domains incl. `nylas.com` + own)
- [ ] Scopes added (openid, userinfo.email, userinfo.profile, calendar)
- [ ] Web OAuth client created, redirect = `https://api.eu.nylas.com/v3/connect/callback`
- [ ] Client ID/secret set in Nylas **BeeNiceCal Production** Google connector
- [ ] Live test flow shows **BeeNice Calendar** (not nylas.com)
- [ ] App **published / In production**
- [ ] Verification submitted with scope justification + demo video
- [ ] Verification **approved** (no more unverified-app warning)
