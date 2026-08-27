# UI Reference Audit

## Purpose and guardrail

This audit records public UI references considered for Sallah's closed beta. They
are references for interaction principles only. **No source code, visual assets,
copy, branding, screenshots, layouts, or data were copied from any reference.**
Sallah remains an Arabic-first Saudi Premium Service Marketplace with its own
domain rules, Supabase-backed trust model, and visual identity.

## Reference assessment

| Reference                                                                                                                | Verified status                                                                                                  | Useful inspiration                                                                        | Decision                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Enatega multivendor](https://github.com/enatega/food-delivery-multivendor)                                              | MIT; active repository (push observed 2026-08-25); customer app declares Expo 53 / React Native 0.79.            | Explicit customer, provider, and fulfiller workflows; visible order lifecycle.            | Use only the idea of role-aware journeys and explicit status progression. Do not adopt its multi-app architecture, code, assets, or delivery branding. |
| [food_ordering](https://github.com/adrianhajdin/food_ordering)                                                           | No repository license declared; last code push observed 2025-08-08; Expo 53 / React Native 0.79 / Expo Router 5. | Discover, filter, detail, and review flows.                                               | Ideas only. No code, tutorial kit, images, or copy may be reused.                                                                                      |
| [VadimNotJustDev/UberEats](https://github.com/VadimNotJustDev/UberEats)                                                  | No repository license declared; last code push observed 2022-05-13; Expo 44 / React Native 0.64.                 | A service request's state can remain legible during fulfilment.                           | Do not reuse; technical stack is materially dated. Avoid map-first, delivery-clone presentation.                                                       |
| [VadimNotJustDev/UberClone](https://github.com/VadimNotJustDev/UberClone)                                                | MIT; last code push observed 2024-06-09; React Native 0.63 / React Navigation 5.                                 | Generic request-to-completion progression.                                                | Inspiration only. Do not copy code, assets, or Uber-like branding; technical patterns are dated.                                                       |
| [Material 3](https://m3.material.io/)                                                                                    | Current official design-system reference.                                                                        | Component states, hierarchy, elevation restraint, and semantic color roles.               | Adapt principles to Sallah tokens and Arabic layout; do not reproduce a generic Material visual skin.                                                  |
| [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/)                                              | Current official platform guidance.                                                                              | Clear tab purpose, predictable navigation, spacious controls, and accessible interaction. | Apply cross-platform principles while preserving platform-native behavior.                                                                             |
| [Expo Router](https://docs.expo.dev/router/introduction/) and [React Native](https://reactnative.dev/docs/accessibility) | Current official implementation guidance.                                                                        | Typed/deep-linkable route structure, semantic accessibility, and RTL support.             | Use as engineering guidance, not as a visual reference.                                                                                                |

## Patterns approved for Sallah

- Keep the user's next safe action visible: create request, compare permitted
  offers, select a provider, schedule, and confirm completion.
- Represent request progress with named states and supporting text, never color
  alone. A state must be understandable without a map, animation, or badge.
- Preserve summary context between screens: service, location precision that is
  authorized for the viewer, price in SAR minor-unit presentation, timing, and
  the allowed next action.
- Use a stable top-level navigation model with short Arabic labels. Navigation
  moves between areas; it does not perform destructive or transactional actions.
- Use progressive disclosure for secondary information and provide explicit,
  reversible controls for filters and selections.

## Patterns rejected for Sallah

- Delivery, ride-hailing, restaurant, Uber, or Enatega visual imitation.
- Dense dashboards, permanently dominant maps, or status information that is
  understandable only by icon or color.
- Hidden or conditionally disappearing primary tabs; navigation must remain
  predictable, with an empty state explaining unavailable content.
- Any UI that could disclose competing offers, a provider's private information,
  or an unmatched exact location.
- Source or assets from an unlicensed repository. Even for MIT sources, Sallah
  will not copy substantial source or assets; this avoids attribution and
  provenance ambiguity.

## Source notes

- Enatega's [LICENSE](https://github.com/enatega/food-delivery-multivendor/blob/main/LICENSE)
  identifies MIT. The other licensing observations are based on their respective
  GitHub repository metadata at audit time.
- Apple advises that tab bars are for top-level navigation, not contextual
  actions, and that controls need comfortable target sizes and spacing. See
  [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
  and [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/).
- React Native's [I18nManager](https://reactnative.dev/docs/i18nmanager) supports
  RTL layout; `forceRTL` is for development/testing and should not be used as a
  production language switch.
