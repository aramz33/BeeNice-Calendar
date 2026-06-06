# Google OAuth 403 with Nylas

Use this when Google shows:

```text
Acces bloque : nylas.com n'a pas termine la procedure de validation de Google
Erreur 403 : access_denied
```

This is a Google OAuth consent-screen restriction. It is not a BeeNice code
failure when the app reaches Google through Nylas Hosted OAuth.

## Immediate tester unblock

1. Open the Google Cloud project that owns the OAuth client used by the Nylas
   Google connector.
2. Go to APIs & Services -> OAuth consent screen -> Audience/Test users.
3. Add the blocked account, for example `contactpro.inart@gmail.com`.
4. Retry the BeeNice calendar connection.

If the consent page still presents the app as `nylas.com`, verify the Nylas
Google connector is using the BeeNice-owned Google OAuth client ID and secret,
not a default/shared Nylas connector.

## Nylas connector checks

In the Nylas BeeNiceCal Production app:

- The Google connector stores the Google OAuth client ID and secret.
- The provider callback registered in Google Cloud points to Nylas:
  `https://api.eu.nylas.com/v3/connect/callback` for the EU Nylas region.
- BeeNice's app callback stays configured in Nylas as:
  `/api/admin/integrations/nylas/callback` on the BeeNice app origin.

## Scopes

For the BeeNice booking flow, keep the scope set copyable and exact:

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/calendar
```

`https://www.googleapis.com/auth/calendar.events` is valid but redundant when
`/calendar` is already requested. `calendar.event` is not a valid Google OAuth
scope.

## Production readiness

Testing mode only works for manually added test users. For external client reps
to connect without being allowlisted, publish the Google OAuth app for external
users and complete Google's OAuth verification for the requested sensitive
calendar scopes.
