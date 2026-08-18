# Required human inputs

These values cannot be safely invented. Development placeholders deliberately make production validation fail.

| Input                                                                                             | Owner                   | Required before               | Safe fallback                                                       |
| ------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------- | ------------------------------------------------------------------- |
| Final public brand and Arabic/English spelling                                                    | Business                | Store metadata/domain         | `SALLAH` codename                                                   |
| Legal entity name and Saudi registration details                                                  | Legal                   | Production/legal text         | `REQUIRES_LEGAL_ENTITY`                                             |
| Production iOS bundle ID and Android package                                                      | Mobile owner            | EAS production build          | `sa.example.sallah` rejected in production                          |
| Apple team, App Store Connect app ID, Google Play account/service account                         | Release owner           | Signing/submission            | Submit disabled/placeholders                                        |
| EAS project ID and Expo access token                                                              | Release owner           | EAS build/push                | Local export only                                                   |
| Public domain, support email, support URL, privacy URL, terms URL                                 | Business/legal          | Public launch/store review    | `.invalid` values rejected                                          |
| Final privacy policy, terms, retention schedule, consent wording                                  | Saudi-qualified counsel | Production/store review       | Engineering drafts only                                             |
| Supabase production project and secrets                                                           | Platform owner          | Deployment                    | Local Supabase                                                      |
| OpenAI credentials, explicit vision-capable model selection, and data terms for diagnostic intake | AI owner/legal          | Live multimodal diagnostic AI | Deterministic local fallback; private media is never exposed by URL |
| Translation processor, payload/DPA/region/retention approval                                      | AI owner/legal/privacy  | Multilingual live briefs      | Original text plus explicit unavailable status                      |
| SMS sender/provider credentials and templates                                                     | Operations              | Phone OTP/SMS                 | Email auth; SMS disabled                                            |
| Payment merchant/gateway credentials and commercial rules                                         | Finance/legal           | Online payment                | Offline/post-service ledger mode                                    |
| Android Google Maps SDK key, billing, and allowed app restrictions                                | Mobile/platform         | Android production maps       | Production validator/build remains blocked                          |
| Push credentials (APNs/FCM/Expo)                                                                  | Mobile owner            | Push delivery                 | In-app outbox; push disabled                                        |
| Production monitoring/alert provider credentials                                                  | SRE                     | Production on-call            | Structured logs only                                                |
| Malware scanner endpoint, authentication secret, and processing region                            | Security/platform       | Production uploads            | Quarantine remains fail-closed                                      |
| Publicly reachable Supabase URL used in signed media responses                                    | Platform owner          | Deployed private media        | Local broker rewrites only the local Docker URL                     |
| Reviewer customer/provider accounts and approved seeded journey                                   | Release/operations      | Store review                  | No fabricated accounts                                              |
| Arabic/English/Urdu/Hindi professional copy review                                                | Localization owner      | Public launch                 | Engineering translations                                            |
| Provider verification policy and regulated-category evidence list                                 | Operations/legal        | Provider approval             | Manual review, no auto-verify                                       |
| Backup retention/RPO/RTO approval                                                                 | Platform/legal          | Production                    | Proposed values in runbook                                          |

Production enablement requires `pnpm config:validate:production` to pass with non-placeholder values and documented approval.

Repository automation can validate structure, local authorization, and fail-closed behavior, but cannot approve provider contracts, create production accounts, choose legal retention outcomes, supply store signing identities, or claim a physical-device/iOS result. Those items remain external gates rather than software passes.
