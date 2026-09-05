# Claude Code web boundary

The Next.js app includes public pages and a server-authorized operations console.
Visual changes may update components, markup, styles, responsive layout,
accessibility, and safe empty/loading/error states.

Do not move service-role code into client components, weaken server permission
checks, expose private rows, edit API routes for visual work, or add browser
service-role access. Preserve Arabic-first navigation, permission-aware actions,
confirmation dialogs, keyboard focus, responsive tables, and redacted operations
status. Run affected web tests, lint/typecheck/build, i18n, and UI boundaries.
