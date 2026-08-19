# Android startup session recovery

Issue: #12  
Scope: Android release-candidate startup only

## Root cause

The previous chunked SecureStore adapter appended `:count` and `:<index>` to
the Supabase auth storage key. Expo SecureStore rejects colons in keys, so the
first auth read could reject before `SessionProvider` cleared its loading state.

## Storage contract

Every original Supabase auth key is now mapped deterministically to:

```text
sallah.auth.v2.<sanitized-prefix>.<sha256-of-original-key>
```

Metadata and chunks use:

```text
<normalized-key>.count
<normalized-key>.chunk.<index>
```

All native keys are limited to `[A-Za-z0-9._-]` and at most 128 characters.
The SHA-256 digest prevents sanitized-prefix collisions. The original key and
stored session values are never logged.

Valid corrected chunks and safe, directly stored legacy sessions remain
readable. Invalid colon-based legacy metadata is never queried through
SecureStore. Malformed or incomplete corrected metadata is removed only from
the application namespace. The recovery action clears only auth keys previously
observed by the Supabase storage adapter.

## Startup contract

Session initialization has a 12-second bounded window. Refresh operations are
serialized and only the newest requested refresh may commit state. Every latest
attempt clears loading in a `finally` block.

Storage, Supabase session, session-context, malformed-context and timeout
failures produce privacy-safe categories. An unresolved local session is never
represented as unauthenticated. The localized recovery screen offers Retry and
Clear local session; public authentication becomes reachable only after a
confirmed empty session or successful local clear.

No database migration, EAS Build, production deployment or credential change is
part of this hotfix.
