# EAS native build configuration

Status: CURRENT SUPPORTING DOCUMENT. Audience: native build and release owners.

EAS evaluates `app.config.ts` locally before submitting a build. Firebase's
`GOOGLE_SERVICES_JSON` secret file is available only inside the build worker, so
local config resolution may omit `android.googleServicesFile`. This does not
authorize a native build without Firebase configuration:

- An Android EAS worker (`EAS_BUILD=true`) rejects an absent file variable.
- Android native prebuild rejects an absent, unreadable, or non-file path through
  an Android manifest config plugin, including native builds outside EAS. It reads
  at most 256 KiB plus an overflow byte and applies the shared release validator:
  valid Firebase client JSON, no nested server credentials, and a matching Android
  package. Errors include neither file contents nor paths.
- Expo copies the supplied file into the generated Android project, where the
  Google Services Gradle plugin processes it. Never create a placeholder file or
  change secret visibility to pass local configuration.

Public Supabase configuration, the restricted Android Maps key, and application
identifiers remain required when resolving Preview or production configuration.
Production also requires the final validated EAS project and application IDs.

## Resolve the existing Preview environment

Run from `apps/mobile` with the project's reviewed EAS CLI available on `PATH`:

```powershell
$env:EXPO_PUBLIC_APP_ENV = 'local'
$env:EXPO_NO_DOTENV = '1'
eas env:exec preview 'eas config --platform android --profile preview --non-interactive --json' --non-interactive
```

`local` bootstraps the outer environment lookup only. `env:exec preview` loads the
actual existing non-secret Preview environment; the inner command then applies
the Preview profile. It does not pull the Firebase secret file. Keep config JSON
private because it can include restricted client configuration.

After reviewing and committing the source, and checking the existing quota,
submit the approved build with the same environment wrapper:

```powershell
eas env:exec preview 'eas build --platform android --profile preview --non-interactive --freeze-credentials --no-wait --json' --non-interactive
```

This uses existing signing credentials and does not submit to a store. Verify the
returned build's Git commit and `preview` profile before installing its APK. A
successful local config check is not a successful cloud build or native test.

## Verification

The mobile `app-config-env` and `native-permissions` suites cover local config
resolution, actual Expo CLI parsing, the EAS-worker missing-file gate, and native
mod compilation with missing/unreadable paths, malformed JSON, server fields,
oversized UTF-8 content, and an incorrect Android package. Tests use synthetic values;
they do not connect to Firebase or prove signing, push delivery, or device behavior.

The distinction follows Expo's documented
[built-in build variables and secret visibility](https://docs.expo.dev/eas/environment-variables/usage/)
and [file environment variables](https://docs.expo.dev/eas/environment-variables/manage/).
