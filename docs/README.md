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
| [Store release checklist](store/RELEASE_CHECKLIST.md)                     | بوابات المتاجر والموافقات          | CURRENT SOURCE OF TRUTH     | الإصدار          |
| [Review accounts](store/REVIEW_ACCOUNTS.md)                               | متطلبات حسابات المراجعة الحقيقية   | CURRENT SUPPORTING DOCUMENT | الإصدار          |
| [Screenshot plan](store/SCREENSHOT_PLAN.md)                               | خطة لقطات المتجر والجهاز           | CURRENT SUPPORTING DOCUMENT | التصميم والإصدار |
| [Apple review notes](store/APPLE_REVIEW_NOTES.md)                         | مسودة ملاحظات Apple                | CURRENT SUPPORTING DOCUMENT | الإصدار          |
| [Google Play notes](store/GOOGLE_PLAY_NOTES.md)                           | مسودة ملاحظات Google Play          | CURRENT SUPPORTING DOCUMENT | الإصدار          |
| [Apple privacy draft](store/APPLE_PRIVACY_DRAFT.md)                       | مسودة ملصق خصوصية Apple            | CURRENT SUPPORTING DOCUMENT | القانون والإصدار |
| [Data Safety draft](store/DATA_SAFETY_DRAFT.md)                           | مسودة Google Play Data Safety      | CURRENT SUPPORTING DOCUMENT | القانون والإصدار |

## OSS والتصميم والأدلة | OSS, design, and evidence

| المستند                                                                                            | الوصف العربي                           | الحالة                      | الجمهور          |
| -------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------- | ---------------- |
| [OSS evaluation](oss/OSS_EVALUATION.md)                                                            | قرارات قبول ورفض المصادر المفتوحة      | CURRENT SUPPORTING DOCUMENT | الهندسة والقانون |
| [OSS inventory](oss/OSS_INVENTORY.md)                                                              | طريقة قراءة السجل المولد               | CURRENT SUPPORTING DOCUMENT | الهندسة والقانون |
| [M1 design](superpowers/specs/2026-08-20-marketplace-trust-ugc-safety-design.md)                   | تصميم الثقة وسلامة المحتوى المعتمد     | CURRENT SUPPORTING DOCUMENT | الأمن والهندسة   |
| [M1 implementation plan](superpowers/plans/2026-08-20-marketplace-trust-ugc-safety.md)             | خطة تنفيذ M1 وأدلة المهام              | CURRENT SUPPORTING DOCUMENT | الأمن والهندسة   |
| [R1 implementation plan](superpowers/plans/2026-08-21-repository-bilingual-organization.md)        | خطة هذا التنظيم وحدود عدم تغيير المنتج | CURRENT SUPPORTING DOCUMENT | المراجعون        |
| [M2V architecture design](superpowers/specs/2026-08-21-media-scanning-v2-architecture-design.md)   | تصميم بنية الفحص غير المتزامنة المعتمد | CURRENT SOURCE OF TRUTH     | الأمن والهندسة   |
| [M2V remediation plan](superpowers/plans/2026-08-21-media-scanning-v2-remediation.md)              | خطة تنفيذ M2V والتحقق المحلي           | CURRENT SUPPORTING DOCUMENT | الأمن والهندسة   |
| [M2R focused remediation plan](superpowers/plans/2026-08-24-media-scanning-focused-remediation.md) | خطة معالجة نتائج M2C-R2 المحددة        | CURRENT SUPPORTING DOCUMENT | الأمن والهندسة   |
| [Media-scanner boundary map](security/MEDIA_SCANNER_TEST_BOUNDARY_MAP.md)                          | ربط حدود M2B القديمة باختبارات M2R     | CURRENT SUPPORTING DOCUMENT | الأمن والمراجعون |
| [Superseded M2B design](superpowers/specs/2026-08-21-media-scanning-beta-design.md)                | دليل تاريخي للبنية المستبدلة؛ لا يُنفذ | SUPERSEDED DESIGN EVIDENCE  | المراجعون        |
| [Superseded M2B plan](superpowers/plans/2026-08-21-media-scanning-beta.md)                         | خطة مستبدلة محفوظة للتتبع              | SUPERSEDED PLAN EVIDENCE    | المراجعون        |

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
