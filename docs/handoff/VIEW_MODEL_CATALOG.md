# View-model catalog

Visual implementations consume safe projections, not unrestricted database rows.

| Surface          | Existing controller/view-model boundary               | Presentation output                                  |
| ---------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Customer home    | `apps/mobile/src/features/customer`                   | service choices, active/recent request summaries     |
| Request creation | `apps/mobile/src/features/request`                    | draft steps, validation, provider/scan state         |
| Location         | `apps/mobile/src/features/location`                   | city support, saved/transient location, denied state |
| Jobs             | `apps/mobile/src/features/jobs`                       | authorized status timeline and completion actions    |
| Provider         | `apps/mobile/src/features/provider`                   | verification, feed, offer and work projections       |
| Messaging/trust  | `apps/mobile/src/features/trust` and route controller | generic unavailable state and protected attachments  |
| Notifications    | `apps/mobile/src/features/notifications`              | localized event copy and deep-link destination       |
| Admin            | server components and `apps/web/src/lib`              | permission-scoped operational rows                   |

If a visual change needs a new field, open the [UI contract change process](UI_CONTRACT_CHANGE_PROCESS.md).
Do not query additional private columns in a component.
