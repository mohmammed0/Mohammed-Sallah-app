# UI contract change process

When an approved design cannot be implemented inside the allowlist, create a
separate Codex-owned request. Do not modify the backend in the UI branch.

The request must contain:

- current contract and source path;
- requested contract and reason;
- affected screens/routes/roles/states;
- data minimization and privacy impact;
- authorization/RLS/RPC/Storage/location/media impact;
- migration and backward-compatibility impact;
- tests and rollout/rollback evidence required.

Codex evaluates and implements any accepted functional change test-first on a
separate branch. Figma/Claude then rebase conceptually onto the approved typed
contract through a normal reviewed PR—never by force-push or history rewrite.
