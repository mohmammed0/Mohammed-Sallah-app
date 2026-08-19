# EAS Preview bootstrap

Status: configuration bootstrap complete; build not started  
Evidence run: https://github.com/mohmammed0/Mohammed-Sallah-app/actions/runs/32217956056  
Evidence source: `778ec4633e1ec535273e9b44075d35bac85c4db1`

## Public project identity

- Expo owner: `binmuhayas-team`
- Project slug: `sallah`
- Public EAS project ID: `f098f941-ae73-4007-b582-ba6fb1b8aa7a`
- Dashboard: https://expo.dev/accounts/binmuhayas-team/projects/sallah
- Initialization result: the project was created once during the guarded bootstrap and then
  verified as linked. No duplicate project was created.

## Preview profile

- EAS environment: `preview`
- Distribution: internal
- Channel: `preview`
- Android artifact type: APK
- Android package: `com.mohmammed0.sallah.preview`
- iOS preview bundle ID: `com.mohmammed0.sallah.preview`
- Runtime version policy: Expo fingerprint
- App version source: remote
- Auto-increment: enabled

These identifiers classify this as a nonproduction Preview application. Production
identifiers and store submission placeholders are unchanged.

## Account-specific cost evidence

The authenticated `eas account:usage --json --non-interactive` response reported:

- Plan: Free
- Billing period: 2026-08-01 through 2026-09-01
- Android builds used: 0
- Included Android limit: 15
- Remaining included Android capacity: 15
- Expected next low-priority Android Preview build cost: **$0 EXPECTED**

The CLI response did not explicitly report whether usage-based billing is enabled.
No plan was upgraded, no billing setting was changed, and no build was started.

## Secure environment boundary still required

The EAS `preview` environment is not complete until these names are configured
through an approved secure Expo/EAS boundary:

- `EXPO_PUBLIC_SUPABASE_URL` — public configuration
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — treat as sensitive configuration in
  operational tooling even though it is a publishable client key

No values are documented or committed. The Expo access token remains a GitHub
Actions secret and was not displayed or uploaded. No signing credentials were
configured, and no EAS Build, EAS Update, deployment, or store submission was run.
