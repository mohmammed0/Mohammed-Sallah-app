# Google Play notes draft

Use the four-language proposals in [STORE_LISTING_DRAFTS.md](STORE_LISTING_DRAFTS.md) after brand and copy approval.

The current app supports customer and provider roles, request drafting, private offers, provider selection, messaging, job progress/change orders, completion, rating, support and disputes. Provider verification and eligibility are server-controlled. Requests support manual text entry or optional AI assistance; the latter requires an explicit OpenAI disclosure and permission before sending content. Reporting a suggestion opens in-app support without silently attaching private context.

Proposed category: House & Home, subject to final owner selection. Foreground location, microphone, camera/photo picker and notifications are used in context. Do not declare broad photo/video-library access from source plugin names; inspect the final merged AAB permissions. Provider location sharing sends temporary foreground updates, with stop/background/30-minute expiry controls. Online payment is disabled. Data Safety answers remain drafts until production SDKs/processors are frozen.

Current policies must be readable and affirmatively accepted before posting content. Product routes wait for server-validated acceptance while support/account privacy controls remain reachable. The legal owner must publish approved privacy, terms and community documents in all four locales; hash-only draft records do not qualify. [Google's UGC policy requires acceptance of the applicable terms or user policy before users create or upload content](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en-GB).

Messages/ratings have reporting, messages have blocking, and AI suggestions have an in-app reporting route. Before launch, verify objectionable-content filtering and staffed response/removal procedures. Malware scanning and file sanitization alone are not evidence of content moderation. [Google's AI-content policy requires in-app reporting or flagging](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en-GB).

In-app and public account-deletion request paths exist. Supply and test the public deletion URL, identity-verification delivery, privacy-worker completion and approved retention explanation. The public path must function without requiring app reinstallation. [Google account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Package/signing ownership, Play account/agreement, working URLs/contacts, rating/Data Safety answers, reviewer fixtures, actual AAB and device evidence are required. No submission has been performed by this preparation work.
