# Customer redesign physical-device gates

Status: **NOT RUN**. These scenarios require a Preview build, restricted Maps key and real devices.
No EAS build is started by PR #14.

## Location and maps

1. On Android Preview, verify the Google key is restricted to the Preview package and actual signing
   SHA-1, then confirm map tiles render without exposing the key in logs or Expo JS `extra`.
2. Select a saved location on Home, start a request, and verify it is already selected.
3. Pan continuously and verify no reverse-geocode request occurs until movement ends; verify one
   debounced lookup for the settled pin.
4. Test Riyadh, Jeddah and Dammam as supported; test an unsupported Saudi city separately.
5. Feed the Missouri emulator coordinate and verify the localized outside-Saudi state plus the
   action to move the map inside Saudi Arabia. It must never become Riyadh automatically.
6. Deny foreground permission, retry, enable permission in Settings, and verify recovery. Confirm
   background permission is never requested.
7. Remove/disable the Maps key and verify the bounded localized map fallback instead of a blank view.

## Chat, media and restart

1. With Arabic and Urdu, verify bubbles, chevrons, fields, category grid and tabs use RTL without an
   application restart; repeat English and Hindi in LTR.
2. Open the keyboard and verify only the message timeline scrolls while the composer stays visible
   above keyboard and safe area; new replies scroll into view.
3. Exercise text, camera, gallery and voice. Confirm pending/offline/retry status stays on the exact
   message and contextual quick replies answer the current question while free text remains usable.
4. Record voice offline, restart, reconnect, and verify one upload/transcription/AI turn with the same
   `clientMessageId`. Force one transcription failure and retry without restarting.
5. Verify the final review shows no file paths, signed URLs, internal enum values or error codes.

## Accessibility

Verify TalkBack/VoiceOver order, live-region announcements, 200% font scaling, minimum touch targets,
focus indicators, color contrast, camera/microphone permission explanations and review Edit actions.
Attach real-device screenshots/logs to Issue #15 before changing any item from **NOT RUN**.
