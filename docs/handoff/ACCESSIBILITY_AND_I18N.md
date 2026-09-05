# Accessibility and internationalization

Arabic is the source design language. Every visible string uses shared keys for
Arabic, English, Urdu, and Hindi. Arabic/Urdu are RTL; English/Hindi are LTR.
Use logical layout properties and preserve semantic source order.

Every visual change must verify:

- 44-point-or-equivalent touch targets and visible focus/pressed/disabled states;
- screen-reader names, roles, state, and error announcements;
- keyboard avoidance and multiline editing;
- dynamic/large text without hiding critical actions;
- high contrast for text, status, focus, and error;
- reduced motion and no task-blocking animation;
- icon meaning not conveyed by color alone;
- route, deep-link, and destructive-confirmation accessibility.

Run `pnpm i18n:check`, affected rendering tests, and the UI catalog states.
