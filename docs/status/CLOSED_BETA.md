# النسخة التجريبية المغلقة | Closed beta

[العربية](../ar/CLOSED_BETA.md) · [Documentation map](../README.md)

**التصنيف | Classification:** CURRENT SOURCE OF TRUTH
**آخر تحقق مرجعي | Reference date:** 2026-08-21

## الحالة المختصرة | Summary

- **M1 — Marketplace Trust and UGC Safety:** مكتمل ومجمّد عند
  `46e8c8cd5bc85dcbd24efad50ab0d22cd39eb31b` عبر
  [Draft PR #17](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/17).
- **M2 — Production-quality media scanning:** اختيرت البنية ونطاق القبول، لكن التنفيذ لم يبدأ.
  المرجع هو [Issue #20](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/20).
- التنظيم الثنائي اللغة R1 لا يغير سلوك المنتج أو قاعدة البيانات ولا يبدأ M2.

M1 Marketplace Trust and UGC Safety is complete and frozen at the approved PR #17 head. M2
production-quality media scanning has a selected architecture and documented acceptance scope, but
implementation has not started. R1 changes documentation organization only; it does not alter
product/database behavior or start M2.

## المراجع الرسمية | Authoritative links

- [Master Tracker #23](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/23)
- [Parent RC Draft PR #7](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/7)
- [Frozen M1 Draft PR #17](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/17)

## معنى الحالات | Status vocabulary

| الحالة                   | المعنى                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PASS**                 | نجح فحص محدد على البيئة والرأس المذكورين مع دليل يمكن تتبعه. A named check passed on the stated head and environment with traceable evidence.        |
| **NOT RUN**              | لم يُنفذ الفحص؛ لا يعني نجاحاً أو فشلاً. The check was not executed; this is neither pass nor fail.                                                  |
| **HUMAN INPUT REQUIRED** | يلزم قرار أو حساب أو اعتماد أو جهاز أو قيمة لا يجوز للمستودع اختلاقها. An authorized decision, account, approval, device, or real value is required. |
| **OUT OF BETA SCOPE**    | العمل مؤجل عمداً خارج بوابة النسخة التجريبية الأولى. Work is deliberately deferred beyond the initial beta gate.                                     |

## خارطة الطريق | Roadmap

| المرحلة                                 | الحالة                                             | المرجع                                                              |
| --------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| M1 — الثقة وسلامة المحتوى               | **PASS / FROZEN**                                  | [PR #17](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/17) |
| M2 — فحص الوسائط                        | **NOT STARTED**؛ البنية مختارة                     | [#20](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/20)  |
| M3 — AI/التفريغ/الترجمة الحقيقية        | **HUMAN INPUT REQUIRED** قبل التكامل الحقيقي       | [#18](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/18)  |
| M4 — الإشعارات الفعلية                  | **NOT RUN** على جهاز فعلي                          | [#19](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/19)  |
| M5 — تجربة مقدم الخدمة وإتاحة beta      | **NOT STARTED**                                    | [#16](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/16)  |
| M6 — النسخ الاحتياطي والمراقبة والتشغيل | **HUMAN INPUT REQUIRED**                           | [#21](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/21)  |
| M7/M8 — Android RC واختبار جهاز فعلي    | **NOT RUN**                                        | [#15](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/15)  |
| M9 — بوابة الأمن والقانون والتشغيل      | **HUMAN INPUT REQUIRED**                           | [#22](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/22)  |
| M10 — iOS/TestFlight                    | **OUT OF BETA SCOPE** للبوابة الأولى Android-first | [#23](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/23)  |

لا تتطلب النسخة التجريبية الأولى مدفوعات إلكترونية أو دفعات آلية لمقدمي الخدمات أو SMS OTP إذا
كفى البريد الإلكتروني أو إطلاقاً عاماً في App Store/Google Play أو تتبع موقع بالخلفية.

## الأدلة والبوابات | Evidence and gates

- اختبارات المستودع المحلية تثبت فقط النطاق الذي شُغلت عليه؛ أحدث نتائج M1 التفصيلية تبقى في
  تقارير التنفيذ وخططها ولا تتحول تلقائياً إلى دليل جهاز أو إنتاج.
- اختبار Android/iOS الفعلي، حسابات المتاجر، الهوية القانونية، عناوين الدعم العامة، اتفاقيات
  مزودي الخدمات، ومفاتيح الإنتاج هي **HUMAN INPUT REQUIRED**.
- الإنتاج والنشر والمتاجر والخدمات المدفوعة ليست أعمالاً مصرحاً بها في R1.
- السجلات السابقة محفوظة في [الأرشيف](../archive/README.md) و
  [تقارير التحقق](../validation/FINAL_VALIDATION_REPORT.md)، لكنها ليست حالة اليوم.

Repository-local checks prove only the command, head, and environment recorded. Physical-device
tests, store identities, legal approvals, public support identity, vendor agreements, and
production credentials remain separate human gates. R1 does not authorize production, stores,
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
