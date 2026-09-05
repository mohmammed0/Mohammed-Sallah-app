# النسخة التجريبية المغلقة | Closed beta

[العربية](../ar/CLOSED_BETA.md) · [Documentation map](../README.md)

**التصنيف | Classification:** CURRENT SOURCE OF TRUTH
**آخر تحقق مرجعي | Reference date:** 2026-09-05

## الحالة المختصرة | Summary

- Current launch preparation is [draft PR #36](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/36),
  based on UI PR #35. Application source `de2b64813a7e61682d86f3528393d85c0f81dddb` passes local
  `pnpm validate` with 631 workspace tests and one documented Windows skip.
- The [launch verification packet](../validation/LAUNCH_READINESS_2026-09-05.md) records exact hosted
  CI, signed Android Preview/emulator evidence, reviewed consent, four-language entry/policy UX,
  Codex Security scope and remaining physical/production/store gates.
- Hosted Preview has not received the new legal migrations or approved policy packet. Follow the
  [read-only migration mapping](../validation/PREVIEW_MIGRATION_RECONCILIATION_2026-09-05.md) and
  [publication order](../operations/LEGAL_PUBLICATION.md); never blindly replay historical migrations.
- **Public launch: HUMAN INPUT REQUIRED.** Final legal entity, domain/support address, reviewed
  policies, production/store accounts, physical-device and operational evidence remain outstanding.
  The original working tree is preserved; PRs were not merged and production was not deployed.

## سجل المراحل السابق | Earlier milestone record

The following describes the August checkpoint, not the current launch source or fresh provider proof.

- Draft PRs #7, #17, #24, #25, #26, #31, and #32 form one verified stacked chain. PR #32 head
  `f8bce88065b8c9b4ab23521c9bd312d1a9e2b080` contains every listed milestone head.
- **M2:** repository implementation and hosted CI completed at
  `03c35255514f4a2aba008a86912eaf38b0029eca`; Preview Storage and the outbound DigitalOcean
  scanner now have clean image/audio and EICAR evidence.
- **Feature complete / professional beta:** customer, provider, admin, OpenAI text/image/audio/
  translation, Maps emulator, and Android Preview artifact evidence are recorded in PRs #31/#32.
- **Work at that checkpoint:** repository finalization and multi-tool engineering handoff. PR #32's two known
  CI defects are repaired locally and require exact-head hosted confirmation before handoff PASS.

No Production, public-store, paid-plan, merge, or physical-device action occurred. Preview Push is
build/configuration ready, but physical receipt/tap remains NOT RUN. Monitoring and backup have
bounded beta visibility/runbooks; formal alert and restore drills remain external gates.

## المراجع الرسمية | Authoritative links

- [Master Tracker #23](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/23)
- [Parent RC Draft PR #7](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/7)
- [Frozen M1 Draft PR #17](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/17)
- [R1 bilingual repository Draft PR #24](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/24)
- [Green D1 Expo alignment Draft PR #25](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/25)

## معنى الحالات | Status vocabulary

| الحالة                   | المعنى                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PASS**                 | نجح فحص محدد على البيئة والرأس المذكورين مع دليل يمكن تتبعه. A named check passed on the stated head and environment with traceable evidence.        |
| **NOT RUN**              | لم يُنفذ الفحص؛ لا يعني نجاحاً أو فشلاً. The check was not executed; this is neither pass nor fail.                                                  |
| **HUMAN INPUT REQUIRED** | يلزم قرار أو حساب أو اعتماد أو جهاز أو قيمة لا يجوز للمستودع اختلاقها. An authorized decision, account, approval, device, or real value is required. |
| **OUT OF BETA SCOPE**    | العمل مؤجل عمداً خارج بوابة النسخة التجريبية الأولى. Work is deliberately deferred beyond the initial beta gate.                                     |

## خارطة الطريق | Roadmap

| المرحلة                                 | الحالة                                                           | المرجع                                                              |
| --------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| M1 — الثقة وسلامة المحتوى               | **REPOSITORY/PREVIEW ACTIVE**؛ production audit pending          | [PR #17](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/17) |
| M2 — فحص الوسائط                        | **PREVIEW ACTIVE**؛ production provisioning/audit pending        | [#20](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/20)  |
| M3 — AI/التفريغ/الترجمة الحقيقية        | **PREVIEW SYNTHETIC CANARIES PASS**؛ production approval pending | [#18](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/18)  |
| M4 — الإشعارات الفعلية                  | **BUILD READY / PARTIAL**؛ physical receipt **NOT RUN**          | [#19](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/19)  |
| M5 — تجربة مقدم الخدمة وإتاحة beta      | **REPOSITORY/PREVIEW COMPLETE**؛ physical device **NOT RUN**     | [#16](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/16)  |
| M6 — النسخ الاحتياطي والمراقبة والتشغيل | **RUNBOOK/PARTIAL**؛ formal restore/alert drills **NOT RUN**     | [#21](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/21)  |
| M7/M8 — Android RC واختبار جهاز فعلي    | **APK + MAPS EMULATOR EVIDENCE**؛ physical device **NOT RUN**    | [#15](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/15)  |
| M9 — بوابة الأمن والقانون والتشغيل      | **HUMAN INPUT REQUIRED**                                         | [#22](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/22)  |
| M10 — iOS/TestFlight                    | **OUT OF BETA SCOPE** للبوابة الأولى Android-first               | [#23](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/23)  |

لا تتطلب النسخة التجريبية الأولى مدفوعات إلكترونية أو دفعات آلية لمقدمي الخدمات أو SMS OTP إذا
كفى البريد الإلكتروني أو إطلاقاً عاماً في App Store/Google Play أو تتبع موقع بالخلفية.

## الأدلة والبوابات | Evidence and gates

- تحقق M3 المحلي المباشر في 2026-08-26 نفّذ ستة طلبات متسلسلة فقط ببيانات اصطناعية: تشخيص نصي
  وصورة نظيفة عبر `gpt-5.6-terra`، تفريغ M4A نظيف قابل للتحرير عبر `gpt-transcribe`، وترجمة موجز
  مقدم الخدمة إلى الإنجليزية والأردية والهندية عبر `gpt-5.6-luna`. كلها **PASS** محلياً. تفعيل
  Preview والتدقيق الأمني النهائي واختبار الجهاز **NOT RUN**، ولم تُستخدم بيانات مستخدمين حقيقية.
- بعد ذلك فُعّلت OpenAI Preview canaries الاصطناعية للنص والصورة والصوت والترجمة، وفُعّل ماسح
  DigitalOcean outbound-only مع Storage S3 وقدرات قصيرة العمر؛ clean image/audio وEICAR وcleanup
  مسجلة PASS في ملاحظات beta الحالية.
- FCM/Expo وMaps Preview وإعداد EAS موجودة، وMaps تحقق على المحاكي وبُني APK Preview موثق. Push
  physical receipt والتجربة على جهاز فعلي لا تزال **NOT RUN** ولا تتحول إلى PASS من المحاكي.
- اختبارات المستودع المحلية تثبت فقط النطاق الذي شُغلت عليه؛ أحدث نتائج M1 التفصيلية تبقى في
  تقارير التنفيذ وخططها ولا تتحول تلقائياً إلى دليل جهاز أو إنتاج.
- اختبار Android/iOS الفعلي، حسابات المتاجر، الهوية القانونية، عناوين الدعم العامة، اتفاقيات
  مزودي الخدمات، ومفاتيح الإنتاج هي **HUMAN INPUT REQUIRED**.
- الإنتاج والنشر والمتاجر والخدمات المدفوعة ليست أعمالاً مصرحاً بها في M2V.
- السجلات السابقة محفوظة في [الأرشيف](../archive/README.md) و
  [تقارير التحقق](../validation/FINAL_VALIDATION_REPORT.md)، لكنها ليست حالة اليوم.

Repository-local checks prove only the command, head, and environment recorded. Physical-device
tests, store identities, legal approvals, public support identity, vendor agreements, and
production credentials remain separate human gates. M2V does not authorize production, stores,
paid services, or deployment.

## سياسة الفروع | Branch policy

- `main`: stable/released only.
- Parent RC branch: release-candidate integration.
- Beta branch: closed-beta integration.
- Milestone child branches: start from the approved beta head and return through review.

## عناوين GitHub الثنائية | Bilingual GitHub titles

يعتمد تنظيم R1 العناوين العربية أولاً مع إبقاء المعرفات التقنية ومحتوى القبول الإنجليزي كما هو.

| الرقم | العنوان                                                                                  |
| ----- | ---------------------------------------------------------------------------------------- |
| #23   | النسخة التجريبية المغلقة v0.1 \| Closed Beta v0.1 — Master Readiness Tracker             |
| #20   | [M2] فحص الوسائط الآمن \| Production-Quality Media Scanning                              |
| #18   | [M3] الذكاء الاصطناعي والصوت والترجمة \| AI, Transcription & Translation                 |
| #19   | [M4] الإشعارات الفورية \| Push Notification Delivery                                     |
| #21   | [M6] النسخ الاحتياطي والمراقبة والعمليات \| Backup, Monitoring & Operations              |
| #22   | [M9] بوابة الأمان ودعوة المختبرين \| Security & External Tester Invite Gate              |
| #15   | [M7–M8] الخرائط واختبار Android على الأجهزة \| Android Maps & Physical Device Validation |
| #16   | [M5] تجربة مقدم الخدمة وإتاحة الاستخدام \| Provider UX & Accessibility                   |

## بيانات المستودع | Repository metadata

يعتمد تنظيم R1 الوصف والموضوعات التالية من دون تغيير اسم المستودع أو ظهوره أو فرعه الافتراضي أو
Website.

**Description**

> منصة سعودية ذكية تربط العملاء بمقدمي الخدمات الموثقين | AI-assisted Saudi marketplace for
> verified local services

**Topics**

`saudi-arabia`, `marketplace`, `expo`, `react-native`, `nextjs`, `supabase`,
`typescript`, `rtl`, `ai`, `services`, `mobile-app`
