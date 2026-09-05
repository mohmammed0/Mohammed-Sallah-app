# Changelog

This project follows coherent Conventional Commit milestones. It is not yet a
public release; exact shipped tags and dates will be added only after owner approval.

## Unreleased — engineering handoff

### Added

- Machine-readable and human-readable multi-tool handoff contracts.
- Development-only synthetic UI state catalog and presentation import boundary checks.
- Stable logical notification identity across in-app and Push transports.

### Fixed

- Completion rejection now creates one authoritative logical provider notification
  across first execution, replay, response loss, concurrency, and later unrelated events.
- Mobile trust integration isolates its presentation dependency in the focused test runtime.

### Not released

Production deployment, public stores, iOS signing/build, physical-device matrix,
formal restore/alert drills, and owner/legal approvals remain external gates.
