# Known limitations

- Engineering handoff and Preview evidence do not establish Production readiness.
- The installed/emulator APK predates this finalization diff unless an exact-head
  build is recorded in validation evidence.
- Physical Push receipt/tap, GPS accuracy, camera/audio behavior, and device
  accessibility remain NOT RUN without a physical device.
- iOS signing/build remains dependent on Apple account access.
- Production backup restore, alert delivery, load/canary, legal/privacy, and
  public store gates remain external.
- The Windows Supabase CLI bootstrap can report `user_role already exists`
  before the first repository migration; Linux hosted CI is the authoritative
  clean-bootstrap check. A manual local database is not accepted for privilege
  equivalence where its bootstrap grants differ.
- Visual identity remains open for Figma; existing UI is a functional reference.
