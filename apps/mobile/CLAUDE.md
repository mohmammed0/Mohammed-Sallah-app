# Claude Code mobile boundary

Expo Router owns route composition; root protection and the customer/provider tab
trees are functional contracts. Do not add self-redirects, dynamic tab mutation,
role feedback loops, or duplicate route ownership.

Prefer `src/components`, `src/design-system`, and presentation-only feature files.
Existing `app/**` files may mix controller and view responsibilities: change only
composition/style/accessibility unless a separate Codex contract PR approves
logic changes. Never alter Supabase calls, secure upload, notification routing,
session/role policy, exact-location disclosure, or media authorization for a
visual task.

Verify affected Vitest files, mobile lint/typecheck, i18n parity, UI boundaries,
RTL/LTR, large text, keyboard behavior, and the synthetic UI catalog.
