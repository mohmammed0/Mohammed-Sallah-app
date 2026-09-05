# Domain invariants

- Supabase is authoritative; UI state never grants permission.
- Providers cannot read competing offers or unmatched exact locations.
- Provider operations require active role, verified profile, approved service,
  service area, availability, and request eligibility.
- Money is integer SAR minor units; timestamps are UTC and display in Riyadh time.
- Critical commands are transactional, versioned/idempotent, and audited.
- One command replay returns its original result; a changed payload conflicts.
- One logical notification may have one row per transport, all linked to one
  authoritative logical identity.
- Private media stays quarantined until scanner-clean, verified, attested, and
  server-promoted; failure remains fail-closed.
- Offers remain sealed until authorized customer comparison.
- Completion attempts and decisions are append-only history; disputes retain
  evidence and resumable state.
- Account export/deletion respects retention and reviewer scopes.

Changes to these rules belong to Codex/backend review, not visual implementation.
