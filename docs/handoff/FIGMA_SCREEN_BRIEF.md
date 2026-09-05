# Figma screen brief

For every screen in [screen inventory](SCREEN_INVENTORY.md) and [routes](ROUTE_CATALOG.md),
document: purpose, primary/secondary/destructive actions, safe data fields,
loading/ready/empty/error/offline/forbidden states, locale/direction, focus order,
responsive behavior, component candidates, and functional invariants.

## Prototype priority

1. Customer: home → service → AI text/image/voice → transcript/clarification →
   location/timing → review/publish → offer comparison → selected job/completion.
2. Provider: verification dashboard → feed → translated brief → offer → selected
   job → completion evidence.
3. Admin: dashboard → provider review → moderation/support → operational health.

Sensitive display rules: no unmatched exact location, competing provider offers,
private document/path/token, raw provider error, message text in push, or
service-role action in the browser. Design every language and small/large phone;
admin web must remain responsive and keyboard operable.
