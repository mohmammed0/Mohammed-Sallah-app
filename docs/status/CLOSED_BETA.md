# النسخة التجريبية المغلقة | Closed beta

[العربية](../ar/CLOSED_BETA.md) · [Documentation map](../README.md)

**التصنيف | Classification:** CURRENT SOURCE OF TRUTH
**آخر تحقق مرجعي | Reference date:** 2026-08-26

## الحالة المختصرة | Summary

- **M1 — Marketplace Trust and UGC Safety:** مكتمل ومجمّد عند
  `46e8c8cd5bc85dcbd24efad50ab0d22cd39eb31b` عبر
  [Draft PR #17](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/17).
- **R1 / D1:** تنظيم المستودع الثنائي اللغة في Draft PR #24 ومحاذاة Expo SDK 57 في Draft PR #25
  منشوران كفروع أبناء دون دمج.
- **M2 — Production-quality media scanning:** اكتمل تنفيذ المستودع وHosted CI عند
  `03c35255514f4a2aba008a86912eaf38b0029eca` في
  [Draft PR #26](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/26). نُشرت مخططات ودوال
  التحكم إلى مشروع `Sallah Preview` غير الإنتاجي، لكن المضيف الخاص للماسح ما زال
  **HUMAN INPUT REQUIRED**.
- **F1/F2 — Feature completion:** اكتملت مسارات التطبيق والذكاء الاصطناعي محلياً؛ آخر دليل مباشر
  محلي عند `756bff9c2902fb159915b91ef8166a60926dee30`. بدأ P1 تفعيل Preview، لكن أسرار Preview
  وحساب EAS ومفتاح Maps المقيد واعتمادات Push ما زالت مدخلات خارجية.

M1 remains frozen at PR #17, while R1 (#24), D1 (#25), and M2 (#26) remain unmerged Draft PRs.
Preview now has the repository database contract and exact-head Edge Functions, but OpenAI, scanner,
Push, Maps, EAS signing, and external alert delivery are not represented as active without their
account-owned configuration. No production or public-store action occurred.

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

| المرحلة                                 | الحالة                                                                       | المرجع                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| M1 — الثقة وسلامة المحتوى               | **PASS / FROZEN**                                                            | [PR #17](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/17) |
| M2 — فحص الوسائط                        | **REPOSITORY PASS**؛ Preview host **HUMAN INPUT REQUIRED**                   | [#20](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/20)  |
| M3 — AI/التفريغ/الترجمة الحقيقية        | **LOCAL LIVE PASS**؛ Preview secrets **HUMAN INPUT REQUIRED**                | [#18](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/18)  |
| M4 — الإشعارات الفعلية                  | مستودع/دوال Preview **PARTIAL**؛ الاعتمادات والجهاز **HUMAN INPUT REQUIRED** | [#19](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/19)  |
| M5 — تجربة مقدم الخدمة وإتاحة beta      | **REPOSITORY COMPLETE**؛ الجهاز **NOT RUN**                                  | [#16](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/16)  |
| M6 — النسخ الاحتياطي والمراقبة والتشغيل | **HUMAN INPUT REQUIRED**                                                     | [#21](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/21)  |
| M7/M8 — Android RC واختبار جهاز فعلي    | الإعداد مكتمل؛ EAS/Maps والجهاز **HUMAN INPUT REQUIRED**                     | [#15](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/15)  |
| M9 — بوابة الأمن والقانون والتشغيل      | **HUMAN INPUT REQUIRED**                                                     | [#22](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/22)  |
| M10 — iOS/TestFlight                    | **OUT OF BETA SCOPE** للبوابة الأولى Android-first                           | [#23](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/23)  |

لا تتطلب النسخة التجريبية الأولى مدفوعات إلكترونية أو دفعات آلية لمقدمي الخدمات أو SMS OTP إذا
كفى البريد الإلكتروني أو إطلاقاً عاماً في App Store/Google Play أو تتبع موقع بالخلفية.

## الأدلة والبوابات | Evidence and gates

- تحقق M3 المحلي المباشر في 2026-08-26 نفّذ ستة طلبات متسلسلة فقط ببيانات اصطناعية: تشخيص نصي
  وصورة نظيفة عبر `gpt-5.6-terra`، تفريغ M4A نظيف قابل للتحرير عبر `gpt-transcribe`، وترجمة موجز
  مقدم الخدمة إلى الإنجليزية والأردية والهندية عبر `gpt-5.6-luna`. كلها **PASS** محلياً. تفعيل
  Preview والتدقيق الأمني النهائي واختبار الجهاز **NOT RUN**، ولم تُستخدم بيانات مستخدمين حقيقية.
- في P1 طبّق مشروع `Sallah Preview` كل الترحيلات المحلية الـ41 ونشر عشر دوال Edge مطابقة للعقود
  الحالية. تحقق نصي اصطناعي أعاد `provider_unavailable` بأمان قبل استدعاء OpenAI لأن جلسة إدارة
  أسرار Supabase غير متاحة؛ لذلك OpenAI Preview ليس **PASS**. حُذفت حسابات canary الاصطناعية بعد
  الفحص.
- دوال وجدولة Push موجودة وتفشل مغلقة عند غياب Vault/Expo. دوال الماسح موجودة لكن لا يوجد مضيف
  خاص مخول. لا يوجد تسجيل EAS محلي ولا مفتاح Maps Android مقيد، لذلك لم يبدأ أي build.
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
