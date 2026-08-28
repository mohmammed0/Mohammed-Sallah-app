# فهرس التوثيق | Documentation map

[العربية](ar/README.md) · [English](en/README.md) · [Root gateway](../README.md)

هذا هو الفهرس المرجعي للتوثيق. العربية لغة الملاحة الأولى، وتبقى الوثائق التقنية العميقة
بالإنجليزية مرجع العقود الدقيقة. يبين كل صف العنوان والوصف العربي والحالة والجمهور.

This is the authoritative documentation map. Arabic leads navigation; deep English technical
documents remain canonical for exact contracts. Every row identifies title, Arabic description,
status, and audience.

## بوابات المستودع | Repository gateways

| المستند                                              | الوصف العربي                          | الحالة                      | الجمهور            |
| ---------------------------------------------------- | ------------------------------------- | --------------------------- | ------------------ |
| [README عربي](../README.ar.md)                       | الدليل الكامل والرؤية والبنية والحالة | CURRENT SOURCE OF TRUTH     | الجميع             |
| [README English](../README.en.md)                    | النسخة الإنجليزية المتوافقة           | CURRENT SOURCE OF TRUTH     | الجميع             |
| [التوثيق العربي](ar/README.md)                       | مسار عربي حسب دور القارئ              | CURRENT SOURCE OF TRUTH     | الجميع             |
| [English navigation](en/README.md)                   | مسار إنجليزي إلى المراجع التقنية      | CURRENT SOURCE OF TRUTH     | الجميع             |
| [المساهمة](../CONTRIBUTING.md)                       | بوابة ثنائية اللغة لقواعد المساهمة    | CURRENT SOURCE OF TRUTH     | المساهمون          |
| [الأمن](../SECURITY.md)                              | بوابة الإبلاغ والسياسة الأمنية        | CURRENT SOURCE OF TRUTH     | الجميع             |
| [عقد هندسة المستودع](../AGENTS.md)                   | قواعد معمارية وأمنية ملزمة للوكلاء    | CURRENT SOURCE OF TRUTH     | المطورون والوكلاء  |
| [عقد Claude Code](../CLAUDE.md)                      | حدود تنفيذ الواجهة للأداة التالية     | CURRENT SOURCE OF TRUTH     | Claude والمراجعون  |
| [إشعارات الجهات الخارجية](../THIRD_PARTY_NOTICES.md) | تراخيص وإشعارات التبعيات              | CURRENT SUPPORTING DOCUMENT | القانون والمساهمون |

## الحالة والبداية | Status and onboarding

| المستند                                          | الوصف العربي                                       | الحالة                      | الجمهور             |
| ------------------------------------------------ | -------------------------------------------------- | --------------------------- | ------------------- |
| [فهرس الحالة](status/README.md)                  | يميز الحالة الحالية عن الأدلة التاريخية            | CURRENT SOURCE OF TRUTH     | الجميع              |
| [حالة النسخة التجريبية](status/CLOSED_BETA.md)   | الحالة الحالية والمراحل والبوابات والروابط الرسمية | CURRENT SOURCE OF TRUTH     | الجميع              |
| [نظرة المشروع العربية](ar/PROJECT_OVERVIEW.md)   | المشكلة والمستخدمون والتدفق والمعمارية             | CURRENT SOURCE OF TRUTH     | المراجعون الجدد     |
| [ملخص beta العربي](ar/CLOSED_BETA.md)            | شرح عربي موجز للحالة ودلالات الأدلة                | CURRENT SOURCE OF TRUTH     | المراجعون الجدد     |
| [التطوير المحلي العربي](ar/LOCAL_DEVELOPMENT.md) | مسار آمن مختصر إلى المرجع الإنجليزي                | CURRENT SOURCE OF TRUTH     | المطورون            |
| [التطوير المحلي](LOCAL_DEVELOPMENT.md)           | البيئة المحلية والحسابات التجريبية الآمنة          | CURRENT SOURCE OF TRUTH     | المطورون            |
| [الاختبارات العربية](ar/TESTING.md)              | أوامر التحقق وقاعدة الإبلاغ الصادق                 | CURRENT SOURCE OF TRUTH     | المطورون والمراجعون |
| [الاختبارات](TESTING.md)                         | طبقات التحقق ومعنى PASS/NOT RUN                    | CURRENT SOURCE OF TRUTH     | المطورون والمراجعون |
| [المدخلات البشرية العربية](ar/HUMAN_INPUTS.md)   | ملخص عربي للقرارات والقيم الخارجية                 | CURRENT SOURCE OF TRUTH     | ملاك الإصدار        |
| [المدخلات البشرية](HUMAN_INPUTS.md)              | القيم والاعتمادات والأجهزة التي لا يمكن اختلاقها   | CURRENT SOURCE OF TRUTH     | ملاك الإصدار        |
| [عقد البيئة](ENVIRONMENT.md)                     | متغيرات العميل والخادم وفشل الإنتاج المغلق         | CURRENT SUPPORTING DOCUMENT | المطورون وSRE       |
| [عملية الإصدار](RELEASE.md)                      | التجميد والترقية والموافقات والتراجع               | CURRENT SUPPORTING DOCUMENT | ملاك الإصدار        |
| [النشر](DEPLOYMENT.md)                           | ترتيب النشر الآمن وخيارات التراجع                  | CURRENT SUPPORTING DOCUMENT | SRE                 |

## الهندسة | Architecture

| المستند                                                      | الوصف العربي                                  | الحالة                      | الجمهور           |
| ------------------------------------------------------------ | --------------------------------------------- | --------------------------- | ----------------- |
| [Architecture overview](architecture/OVERVIEW.md)            | حدود النظام والتطبيقات والحزم والخلفية        | CURRENT SOURCE OF TRUTH     | الهندسة           |
| [Data model](architecture/DATA_MODEL.md)                     | الكيانات والعلاقات والملكية                   | CURRENT SOURCE OF TRUTH     | الهندسة والبيانات |
| [Security architecture](architecture/SECURITY.md)            | طبقات التفويض والأسرار والتدقيق               | CURRENT SOURCE OF TRUTH     | الأمن والهندسة    |
| [AI architecture](architecture/AI_ARCHITECTURE.md)           | العقود والحدود والفشل المغلق للذكاء الاصطناعي | CURRENT SOURCE OF TRUTH     | AI والهندسة       |
| [Customer experience](architecture/CUSTOMER_EXPERIENCE.md)   | تدفق العميل والموقع والتشخيص والمراجعة        | CURRENT SOURCE OF TRUTH     | المنتج والجوال    |
| [Matching](architecture/MATCHING.md)                         | التأهيل والمطابقة والعروض المختومة            | CURRENT SOURCE OF TRUTH     | السوق والبيانات   |
| [Completion lifecycle](architecture/COMPLETION_LIFECYCLE.md) | الإكمال والأدلة والاعتراضات                   | CURRENT SOURCE OF TRUTH     | السوق             |
| [Idempotency](architecture/IDEMPOTENCY.md)                   | مفاتيح الأوامر وإعادة المحاولة الآمنة         | CURRENT SOURCE OF TRUTH     | الخلفية           |
| [Notifications](architecture/NOTIFICATIONS.md)               | صندوق الصادر وحدود التسليم                    | CURRENT SUPPORTING DOCUMENT | الخلفية والجوال   |
| [Payments](architecture/PAYMENTS.md)                         | الوضع offline والدفتر وحدود التكامل           | CURRENT SUPPORTING DOCUMENT | المالية والهندسة  |

## الأمن والخصوصية | Security and privacy

| المستند                                                   | الوصف العربي                       | الحالة                      | الجمهور               |
| --------------------------------------------------------- | ---------------------------------- | --------------------------- | --------------------- |
| [Threat model](security/THREAT_MODEL.md)                  | الأصول والخصوم وحدود الثقة         | CURRENT SOURCE OF TRUTH     | الأمن                 |
| [RLS matrix](security/RLS_MATRIX.md)                      | مصفوفة القراءة والكتابة حسب الدور  | CURRENT SOURCE OF TRUTH     | الأمن وقاعدة البيانات |
| [Security controls](security/SECURITY_CONTROLS.md)        | سجل الضوابط والأدلة والبقايا       | CURRENT SOURCE OF TRUTH     | الأمن والإصدار        |
| [Dependency risk](security/DEPENDENCY_RISK_EVALUATION.md) | تقييم مخاطر سلسلة التوريد          | CURRENT SUPPORTING DOCUMENT | الأمن وOSS            |
| [Data flow](privacy/DATA_FLOW.md)                         | انتقال البيانات الحساسة بين الأسطح | CURRENT SOURCE OF TRUTH     | الخصوصية والأمن       |
| [Data inventory](privacy/DATA_INVENTORY.md)               | تصنيف مولد لجداول البيانات         | GENERATED                   | الخصوصية والبيانات    |
| [Retention matrix](privacy/RETENTION_MATRIX.md)           | مسودة الاحتفاظ وملاك القرار        | CURRENT SUPPORTING DOCUMENT | القانون والخصوصية     |
| [Store disclosures](privacy/STORE_DISCLOSURES.md)         | مصدر إفصاحات المتاجر               | CURRENT SUPPORTING DOCUMENT | القانون والإصدار      |

## التشغيل | Operations

| المستند                                                              | الوصف العربي                              | الحالة                      | الجمهور     |
| -------------------------------------------------------------------- | ----------------------------------------- | --------------------------- | ----------- |
| [Incident response](operations/INCIDENT_RESPONSE.md)                 | الاستجابة للحوادث والتصعيد                | CURRENT SOURCE OF TRUTH     | الأمن وSRE  |
| [Backup and recovery](operations/BACKUP_AND_RECOVERY.md)             | النسخ والاستعادة والقرارات البشرية        | CURRENT SUPPORTING DOCUMENT | SRE         |
| [Preview media scanner](operations/PREVIEW_MEDIA_SCANNER.md)         | عقد استضافة ماسح Preview دون ادعاء تفعيله | CURRENT SUPPORTING DOCUMENT | المنصة وSRE |
| [Support runbook](operations/SUPPORT_RUNBOOK.md)                     | تشغيل الدعم وحدود الوصول                  | CURRENT SUPPORTING DOCUMENT | الدعم       |
| [Provider verification](operations/PROVIDER_VERIFICATION_RUNBOOK.md) | مراجعة تأهيل مقدم الخدمة                  | CURRENT SUPPORTING DOCUMENT | العمليات    |
| [Payment reconciliation](operations/PAYMENT_RECONCILIATION.md)       | تسوية الدفتر ومراجعة الاستثناءات          | CURRENT SUPPORTING DOCUMENT | المالية     |

## الإصدار والأجهزة والمتاجر | Release, devices, and stores

| المستند                                                                   | الوصف العربي                       | الحالة                      | الجمهور          |
| ------------------------------------------------------------------------- | ---------------------------------- | --------------------------- | ---------------- |
| [Cloud-first device validation](release/CLOUD_FIRST_DEVICE_VALIDATION.md) | مسار التحقق السحابي والجهاز وحدوده | CURRENT SOURCE OF TRUTH     | الإصدار والجوال  |
| [EAS Preview bootstrap](release/EAS_PREVIEW_BOOTSTRAP.md)                 | إعداد Preview بلا ادعاء إنتاج      | CURRENT SUPPORTING DOCUMENT | الإصدار          |
| [Android startup recovery](release/ANDROID_STARTUP_RECOVERY.md)           | تعافي جلسة بدء Android             | CURRENT SUPPORTING DOCUMENT | الجوال           |
| [Customer device scenarios](release/CUSTOMER_DEVICE_SCENARIOS.md)         | بوابات تجربة العميل الفعلية        | CURRENT SOURCE OF TRUTH     | QA والجوال       |
| [External release gates](release/EXTERNAL_RELEASE_GATES.md)               | سجل البوابات الخارجية غير المنفذة  | CURRENT SOURCE OF TRUTH     | الإصدار والملاك  |
| [Store release checklist](store/RELEASE_CHECKLIST.md)                     | بوابات المتاجر والموافقات          | CURRENT SOURCE OF TRUTH     | الإصدار          |
| [Review accounts](store/REVIEW_ACCOUNTS.md)                               | متطلبات حسابات المراجعة الحقيقية   | CURRENT SUPPORTING DOCUMENT | الإصدار          |
| [Screenshot plan](store/SCREENSHOT_PLAN.md)                               | خطة لقطات المتجر والجهاز           | CURRENT SUPPORTING DOCUMENT | التصميم والإصدار |
| [Apple review notes](store/APPLE_REVIEW_NOTES.md)                         | مسودة ملاحظات Apple                | CURRENT SUPPORTING DOCUMENT | الإصدار          |
| [Google Play notes](store/GOOGLE_PLAY_NOTES.md)                           | مسودة ملاحظات Google Play          | CURRENT SUPPORTING DOCUMENT | الإصدار          |
| [Apple privacy draft](store/APPLE_PRIVACY_DRAFT.md)                       | مسودة ملصق خصوصية Apple            | CURRENT SUPPORTING DOCUMENT | القانون والإصدار |
| [Data Safety draft](store/DATA_SAFETY_DRAFT.md)                           | مسودة Google Play Data Safety      | CURRENT SUPPORTING DOCUMENT | القانون والإصدار |

## تشغيل النسخة التجريبية المغلقة | Closed-beta operations

| المستند                                                  | الوصف العربي                                    | الحالة                      | الجمهور          |
| -------------------------------------------------------- | ----------------------------------------------- | --------------------------- | ---------------- |
| [دليل تشغيل النسخة](beta/CLOSED_BETA_RUNBOOK.md)         | تشغيل Preview والخدمات والاستجابة للأعطال       | CURRENT SOURCE OF TRUTH     | التشغيل والإصدار |
| [القيود المعروفة](beta/CLOSED_BETA_KNOWN_LIMITATIONS.md) | حدود المحاكي والمدخلات الخارجية والتدقيق المؤجل | CURRENT SOURCE OF TRUTH     | المنتج والإصدار  |
| [حسابات الاختبار](beta/CLOSED_BETA_TEST_ACCOUNTS.md)     | عناوين الحسابات والأدوار من دون بيانات اعتماد   | CURRENT SUPPORTING DOCUMENT | QA والعمليات     |
| [ملاحظات الإصدار](beta/CLOSED_BETA_RELEASE_NOTES.md)     | حالة الخدمات والواجهات ونطاق الإصدار التجريبي   | CURRENT SOURCE OF TRUTH     | ملاك الإصدار     |

## OSS والتصميم والأدلة | OSS, design, and evidence

| المستند                                                                                                 | الوصف العربي                                     | الحالة                      | الجمهور          |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------- | ---------------- |
| [OSS evaluation](oss/OSS_EVALUATION.md)                                                                 | قرارات قبول ورفض المصادر المفتوحة                | CURRENT SUPPORTING DOCUMENT | الهندسة والقانون |
| [OSS inventory](oss/OSS_INVENTORY.md)                                                                   | طريقة قراءة السجل المولد                         | CURRENT SUPPORTING DOCUMENT | الهندسة والقانون |
| [مراجعة مراجع الواجهة](design/UI_REFERENCE_AUDIT.md)                                                    | المصادر المقبولة والمرفوضة وحدود إعادة الاستخدام | CURRENT SUPPORTING DOCUMENT | التصميم والقانون |
| [تدقيق خط الأساس](design/UI_BASELINE_AUDIT.md)                                                          | عيوب تجربة Preview قبل التحسين                   | CURRENT SUPPORTING DOCUMENT | التصميم والمنتج  |
| [نظام تصميم صلح](design/SALLAH_DESIGN_SYSTEM.md)                                                        | اتجاه Saudi Premium Service Marketplace          | CURRENT SOURCE OF TRUTH     | التصميم والهندسة |
| [خطة النسخة المهنية](superpowers/plans/2026-08-26-closed-beta-professional-ui.md)                       | تنفيذ الواجهات والخدمات والتحقق المركّز          | CURRENT SUPPORTING DOCUMENT | الهندسة والإصدار |
| [M1 design](superpowers/specs/2026-08-20-marketplace-trust-ugc-safety-design.md)                        | تصميم الثقة وسلامة المحتوى المعتمد               | CURRENT SUPPORTING DOCUMENT | الأمن والهندسة   |
| [M1 implementation plan](superpowers/plans/2026-08-20-marketplace-trust-ugc-safety.md)                  | خطة تنفيذ M1 وأدلة المهام                        | CURRENT SUPPORTING DOCUMENT | الأمن والهندسة   |
| [R1 implementation plan](superpowers/plans/2026-08-21-repository-bilingual-organization.md)             | خطة هذا التنظيم وحدود عدم تغيير المنتج           | CURRENT SUPPORTING DOCUMENT | المراجعون        |
| [M2V architecture design](superpowers/specs/2026-08-21-media-scanning-v2-architecture-design.md)        | تصميم بنية الفحص غير المتزامنة المعتمد           | CURRENT SOURCE OF TRUTH     | الأمن والهندسة   |
| [M2V remediation plan](superpowers/plans/2026-08-21-media-scanning-v2-remediation.md)                   | خطة تنفيذ M2V والتحقق المحلي                     | CURRENT SUPPORTING DOCUMENT | الأمن والهندسة   |
| [M2R focused remediation plan](superpowers/plans/2026-08-24-media-scanning-focused-remediation.md)      | خطة معالجة نتائج M2C-R2 المحددة                  | CURRENT SUPPORTING DOCUMENT | الأمن والهندسة   |
| [Finalization design](superpowers/specs/2026-08-27-repository-finalization-multitool-handoff-design.md) | تصميم الإغلاق وحزمة التسليم متعددة الأدوات       | CURRENT SOURCE OF TRUTH     | الهندسة والإصدار |
| [Finalization plan](superpowers/plans/2026-08-27-repository-finalization-multitool-handoff.md)          | خطة التنفيذ والتحقق والنشر المرجعي               | CURRENT SOURCE OF TRUTH     | الهندسة والإصدار |
| [Main finalization plan](superpowers/plans/2026-08-28-main-finalization.md)                             | دمج المرجع النهائي في main وإغلاق GitHub         | CURRENT SOURCE OF TRUTH     | الهندسة والإصدار |
| [Media-scanner boundary map](security/MEDIA_SCANNER_TEST_BOUNDARY_MAP.md)                               | ربط حدود M2B القديمة باختبارات M2R               | CURRENT SUPPORTING DOCUMENT | الأمن والمراجعون |
| [Superseded M2B design](superpowers/specs/2026-08-21-media-scanning-beta-design.md)                     | دليل تاريخي للبنية المستبدلة؛ لا يُنفذ           | SUPERSEDED DESIGN EVIDENCE  | المراجعون        |
| [Superseded M2B plan](superpowers/plans/2026-08-21-media-scanning-beta.md)                              | خطة مستبدلة محفوظة للتتبع                        | SUPERSEDED PLAN EVIDENCE    | المراجعون        |

## التسليم متعدد الأدوات | Multi-tool handoff

ابدأ من [بوابة التسليم](handoff/README.md). الملفات التالية هي العقود الحالية
للتسليم الهندسي والتصميم والتنفيذ، وليست إعلان Production أو Store readiness:

- [Codex starting baseline](handoff/CODEX_STARTING_BASELINE.md)
- [Current state](handoff/CURRENT_STATE.md)
- [Repository map](handoff/REPOSITORY_MAP.md)
- [Product scope](handoff/PRODUCT_SCOPE.md)
- [Architecture summary](handoff/ARCHITECTURE_SUMMARY.md)
- [User roles](handoff/USER_ROLES.md)
- [User journeys](handoff/USER_JOURNEYS.md)
- [Screen inventory](handoff/SCREEN_INVENTORY.md)
- [Route catalog](handoff/ROUTE_CATALOG.md)
- [UI state matrix](handoff/UI_STATE_MATRIX.md)
- [API contracts](handoff/API_CONTRACTS.md)
- [View-model catalog](handoff/VIEW_MODEL_CATALOG.md)
- [Domain invariants](handoff/DOMAIN_INVARIANTS.md)
- [Security boundaries](handoff/SECURITY_BOUNDARIES.md)
- [Privacy boundaries](handoff/PRIVACY_BOUNDARIES.md)
- [Accessibility and i18n](handoff/ACCESSIBILITY_AND_I18N.md)
- [Design-token contract](handoff/DESIGN_TOKEN_CONTRACT.md)
- [Asset and license rules](handoff/ASSET_AND_LICENSE_RULES.md)
- [Mock and fixture guide](handoff/MOCK_AND_FIXTURE_GUIDE.md)
- [Tool ownership matrix](handoff/TOOL_OWNERSHIP_MATRIX.md)
- [Multi-tool backlog](handoff/MULTI_TOOL_BACKLOG.md)
- [Claude Code handoff](handoff/CLAUDE_CODE_HANDOFF.md)
- [Claude start prompt](handoff/CLAUDE_START_PROMPT.md)
- [Tools must start from](handoff/TOOLS_MUST_START_FROM.md)
- [Figma handoff](handoff/FIGMA_HANDOFF.md)
- [Figma screen brief](handoff/FIGMA_SCREEN_BRIEF.md)
- [Canva handoff](handoff/CANVA_HANDOFF.md)
- [Notion/Linear handoff](handoff/NOTION_LINEAR_HANDOFF.md)
- [UI allowlist](handoff/UI_ALLOWLIST.md)
- [UI denylist](handoff/UI_DENYLIST.md)
- [UI contract change process](handoff/UI_CONTRACT_CHANGE_PROCESS.md)
- [External gates](handoff/EXTERNAL_GATES.md)
- [Human inputs remaining](handoff/HUMAN_INPUTS_REMAINING.md)
- [Known limitations](handoff/KNOWN_LIMITATIONS.md)
- [Validation evidence](handoff/VALIDATION_EVIDENCE.md)
- [Handoff checklist](handoff/HANDOFF_CHECKLIST.md)
- [Git ancestry and PR chain](handoff/GIT_ANCESTRY_AND_PR_CHAIN.md)
- [Machine-readable manifest](handoff/handoff-manifest.json)

## أدلة تاريخية | Historical evidence

المواد التالية محفوظة للتتبع فقط ولا تمثل الحالة الحالية:

| المستند                                                          | الوصف العربي                     | الحالة              | الجمهور   |
| ---------------------------------------------------------------- | -------------------------------- | ------------------- | --------- |
| [الأرشيف](archive/README.md)                                     | فهرس اللقطات المستبدلة           | HISTORICAL EVIDENCE | المراجعون |
| [تقدم البناء 2026-08-17](archive/2026-08-17-build-progress.md)   | لقطة قديمة قبل متعقب beta الحالي | HISTORICAL EVIDENCE | المراجعون |
| [Final validation report](validation/FINAL_VALIDATION_REPORT.md) | سجل تحقق لرؤوس وفروع سابقة       | HISTORICAL EVIDENCE | المراجعون |

## سياسة الصيانة | Maintenance policy

1. حدّث [الحالة الحالية](status/CLOSED_BETA.md) عند تغير milestone؛ لا تعد كتابة الدليل التاريخي.
2. حافظ على التكافؤ الدلالي بين بوابات العربية والإنجليزية.
3. أضف كل مستند جديد إلى هذا الفهرس مع الحالة والجمهور.
4. شغل `pnpm docs:check` قبل التسليم.
5. لا تنقل وثائق عميقة لمجرد التنسيق؛ انقل فقط ما صار قديماً أو متناقضاً مع تحديث مراجعه.
