# First public release preparation — 1.0.0

This is a **draft release**, pending the final public name, domain, business and
operational inputs. The package and Android/iOS app version are 1.0.0. Neither
this version number nor a GitHub draft authorizes publication or represents a
completed production acceptance run. The candidate must first be reviewed and
integrated into canonical `main` through the repository's required checks.

## Customer experience

- Publishing preserves the existing customer approval, validated payload and
  journaled server command. Its confirmation opens the exact request's offers.
- Sending, waiting and working use original, subtle native-driver motion. A
  completed state receives one brief confirmation. No percentage, invented
  provider count, waiting deadline or artificial processing delay is introduced.
- Offer and job views refresh while their screen is active. Offer waiting and
  selection account for offline, paused and failed refresh states. Competing
  offers remain private and server eligibility remains authoritative.
- Customer tracking distinguishes provider completion submission from customer
  acceptance. Viewing the required completion evidence remains a prerequisite;
  rejection and dispute controls remain available.
- Protected proof and message links use the validated public Supabase gateway.
  Local CLI projects retain custom ports when `SALLAH_SUPABASE_PUBLIC_URL` is
  explicitly configured, and message proxy links
  use the public function route. Production rejects insecure public origins;
  authentication, authorization and capability lifetimes remain unchanged.
- Arabic and Urdu remain RTL; English and Hindi remain LTR. New customer copy
  is explicit in all four languages. System reduced motion preserves static
  status meaning. Animations stop when the app or screen becomes inactive.
- Headerless native screens respect the status-bar inset. Customer/provider tabs
  reserve the system navigation inset and grow with the text size. Initial sign-in
  waits for the session's legal context without briefly requiring an already accepted
  consent step; legal failure still prevents product entry.
- Android/iOS journal, upload and message identifiers use Expo's native secure
  UUID generator. Browser identifiers continue to require secure-context Web Crypto.

## Design research and asset provenance

The following references were publicly readable on 2026-09-06. They informed
original layouts and interaction decisions; no third-party artwork, product
branding, screenshots, ratings or motion assets were imported.

| Reference                                                                                                                                       | Applied lesson                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Carbon motion](https://carbondesignsystem.com/elements/motion/overview/)                                                                       | Keep routine feedback calm and reserve expressive motion for confirmation.                     |
| [Carbon progress indicators](https://carbondesignsystem.com/components/progress-bar/usage/)                                                     | Distinguish known steps, actual network work and waiting for a person.                         |
| [Nielsen Norman Group](https://www.nngroup.com/articles/progress-indicators/)                                                                   | Acknowledge actions promptly and make waiting understandable.                                  |
| [W3C interaction animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)                                       | Allow nonessential motion to be suppressed; this AAA criterion is not an AA conformance claim. |
| [Apple reduced-motion guidance](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria) | Retain meaning when system motion preferences disable animation.                               |
| [Taskrabbit booking guidance](https://support.taskrabbit.com/hc/en-us/articles/46260422073755-How-Do-I-Hire-a-Tasker)                           | Distinguish sending a booking request from provider confirmation.                              |
| [Dribbble service-app concept](https://dribbble.com/shots/26251678-Home-Service-Mobile-App)                                                     | Keep service, provider and status context together with a clear next action.                   |
| [Behance appliance-service concept](https://www.behance.net/gallery/155913865/Isolved-Home-Appliance-Service-App-UI-Portfolio)                  | Maintain visual continuity between booking and tracking.                                       |

The galleries provide free viewing, not an asset reuse license or proof that
their depicted services work. Their public text and indexed visual previews
were inspected; interactive prototype testing is not claimed.

## Validation and video contract

Release execution evidence must record source SHA/tree, commands, environment,
timestamps, file hashes and actual outcomes in the release artifact directory.
Run `pnpm validate` after the final change. Keep native captures, hosted CI,
disposable-backend acceptance and production acceptance separate.

For custom local gateway ports or a reverse proxy, set the server-only
`SALLAH_SUPABASE_PUBLIC_URL` to the exact public Supabase origin. The Supabase CLI
reserves user-supplied `SUPABASE_*` names and hides its internal port variables
from functions. Hosted HTTPS backends need no override. The standard local/test
stack retains its 54321 fallback; other ports require explicit configuration.

The requested ordering-to-receipt video must identify its actual environment.
Synthetic accounts in an isolated local database can demonstrate real app
interactions and real RPC transitions, but cannot demonstrate production legal
approval, payments, hardware GPS or a real service visit. Any simulated UI
segment must be labeled explicitly and cannot count as backend acceptance.
Never alter a scan status or bypass the evidence-review gate to complete a
recording. Keep tokens, credentials and unrelated user data out of all footage.

## Publication inputs

1. Final Arabic/English app name, public domain, legal entity and support contact.
2. Approved policies and privacy/store disclosures in the four supported languages.
3. Production backend, provider/scanner/monitoring ownership and approved configuration.
4. Final Android/iOS identifiers, signing and relevant store accounts.
5. Exact-candidate GitHub checks, physical-device/accessibility acceptance and
   applicable iOS acceptance, plus the release owner's rollout decision.

Use the complete [human-input register](../HUMAN_INPUTS.md) and
[external gate register](EXTERNAL_RELEASE_GATES.md), not this short list alone.
Missing values continue to fail production validation; development/test values
must never be promoted into production to make a release appear complete.

## Rollback

This customer experience change introduces no database migrations or authorization
policy changes. It adds the MIT-licensed `expo-crypto` 57.0.2 native module, so an
updated native build is required; a JavaScript-only update to an older binary is
insufficient. Deploy the reviewed `media-access` Edge
Function with the client candidate and verify protected-media readback against
the configured public gateway. Revert the reviewed UI/version/broker commits or
restore the prior validated client and Edge Function artifacts through a normal reviewed change.
Preserve server state, audit records and the existing mutation journal. Do not
reset a database or rewrite release history as a client rollback.
