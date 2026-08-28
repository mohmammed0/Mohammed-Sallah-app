# Tool ownership matrix

| Tool          | Inputs                                  | Allowed output                                                           | Prohibited                                                 | Acceptance                                      |
| ------------- | --------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------- |
| Codex         | architecture, contracts, defects, tests | backend, DB/RLS/RPC, Edge, integrations, infrastructure, security, tests | unapproved Production/store/billing                        | repository gates and security review            |
| Figma         | screen brief, tokens, states, journeys  | editable design system, screens, prototypes, visual accessibility specs  | backend contracts, copied assets, final functional changes | product review and complete state coverage      |
| Claude Code   | Figma specs, allowlist, view models     | components, styling, motion, responsive composition, UI tests            | denylist, migrations, RLS/RPC, secrets, deployments        | affected lint/typecheck/tests and UI boundaries |
| Canva         | approved brand and launch brief         | presentations, social/store promotional assets                           | product code, unlicensed assets, claims without evidence   | brand/legal review                              |
| Notion/Linear | manifest, backlog, PR/evidence links    | roadmap, epics, issues, acceptance criteria, owners                      | secrets, replacing Git/source contracts                    | links remain synchronized and status-labelled   |

Branches: `codex/` for engineering, tool-specific reviewed UI branches from the
canonical SHA, never `main`. Functional changes use the contract-change process.
