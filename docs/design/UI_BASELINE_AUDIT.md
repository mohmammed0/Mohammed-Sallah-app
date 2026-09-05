# UI Baseline Audit

## Evidence and scope

This baseline is based on the current Android capture supplied for the closed
beta review. It shows a polished Arabic Home experience. This is a visual
baseline, not a substitute for device-level RTL, accessibility, or authorization
testing. No source code or visual assets were copied while producing this audit.

## Current baseline

The Home screen establishes a strong starting point for the Saudi Premium
Service Marketplace direction:

- Arabic-first reading order and polished hierarchy make the home destination
  feel intentional rather than a generic template.
- The primary service-discovery surface is clear, calm, and premium through
  spacing, restrained surfaces, and a focused action hierarchy.
- The screen gives the user a recognizable entry point for marketplace work
  without relying on a noisy, map-dominant delivery or ride-hailing pattern.

## Primary gap

The current Home quality is not yet a demonstrated system-wide baseline. The
secondary screens need the same level of visual, behavioral, RTL/LTR, and
accessibility consistency. The goal is not to make every screen visually dense;
it is to make every journey feel like the same trusted Sallah product.

## Audit checklist for secondary screens

| Area                     | Baseline requirement                                                                                                              | Evidence to capture                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Hierarchy                | A single clear primary task, readable section titles, and a deliberate surface hierarchy.                                         | Arabic screenshot at default and large text.                                      |
| Navigation               | Stable top-level destinations; predictable Back and modal dismissal behavior.                                                     | Screen recording of Home to detail to return.                                     |
| Request flow             | Each state explains what happened, what is safe to do next, and what information is withheld.                                     | Draft, submitted, offers, selected, in-progress, completed, and failure captures. |
| Offers                   | Compare only authorized data; show price, scope, timing, and trust signals without exposing competing-offer details to providers. | Customer and provider cross-role screenshots.                                     |
| Forms                    | Persistent labels, safe errors, keyboard-safe layout, and no clipping at larger text.                                             | Invalid/valid submission captures and screen-reader labels.                       |
| Loading and empty states | Calm, explanatory, and recoverable; never a blank or misleading screen.                                                           | Slow-network/loading, empty, retry, and error captures.                           |
| RTL/LTR                  | Logical layout, correct directional icons, bidi-safe values, and non-clipped dynamic text.                                        | Arabic RTL plus English/Urdu/Hindi review captures.                               |
| Accessibility            | Labels, roles, state, focus, contrast, and meaningful announcements.                                                              | TalkBack/VoiceOver walkthrough and keyboard review where applicable.              |

## Visual acceptance baseline

A secondary screen meets the baseline only when it:

1. Looks recognizably like the polished Arabic Home through shared type,
   spacing, semantic colors, shape, and interaction feedback.
2. Makes the primary action and the current marketplace state understandable
   without color, animation, or prior product knowledge.
3. Handles loading, empty, error, unauthorized, and long-content cases without
   collapsing the hierarchy.
4. Preserves trust boundaries in every visible data field and action.
5. Works in RTL and LTR with text scaling and assistive technology enabled.

## Prioritized follow-up

1. Bring request creation, offer comparison, provider selection, and request
   detail to the Home visual baseline first; these are the trust-critical paths.
2. Standardize reusable primitives: page header, section header, status badge,
   service/request card, price row, primary/secondary/danger button, field,
   empty state, and error state.
3. Capture role-based, RTL/LTR, and accessibility evidence before declaring the
   UI consistent across the closed beta.
