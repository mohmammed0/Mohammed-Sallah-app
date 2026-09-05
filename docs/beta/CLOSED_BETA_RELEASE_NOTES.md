# ملاحظات إصدار صلّح التجريبي المغلق | Sallah Closed Beta Release Notes

**الإصدار:** Professional Closed Beta candidate
**آخر تحديث مرجعي:** 2026-08-27
**البيئة:** Preview فقط؛ لا يوجد نشر Production أو إرسال عام للمتاجر.

This branch implements the professional closed-beta product experience while preserving the
existing marketplace, authorization, private-media, and scanner contracts. The Android customer
tab runtime blocker is resolved and the repaired exact-head APK is ready for closed-beta
distribution; physical-device and final-audit gates remain deferred.

## حالة المرشح الحالية | Current candidate status

- **READY FOR CLOSED-BETA DISTRIBUTION.** Code SHA
  `191ec64901e5c231306cd3f14048a4c36ac3a163`, EAS build
  `208ab028-3796-45aa-99c3-ec9992298008`, package `com.mohmammed0.sallah.preview`, version `0.1.0`
  and `versionCode 13` produced the repaired APK.
- Root cause: `/customer-home` re-exported legacy `/home`; `/home` redirected customers back to
  `/customer-home`; the navigator therefore updated and remounted the same redirecting tab until
  React reported `Maximum update depth exceeded`.
- Fix: `/customer-home` now renders `CustomerHome` directly while `/home` remains a one-way legacy
  redirect. The premium UI, protected-route ownership, role authorization, and deep links remain.
- Emulator verification passed the customer home, all four tabs, request-creation return, sign-out
  and sign-in, two repeat launches, and customer/provider role switching. No root recovery,
  maximum-depth error, or fatal process exit appeared.
- APK SHA-256:
  `8758f6d42304991012c19e6467d1c7927c377cb5e5ccf9d9a06187603b1ad653`.

## الجديد | What changed

### هوية وتجربة احترافية | Professional experience

- اتجاه بصري «سوق خدمات سعودي متميز»: خلفيات دافئة، تباين قوي، ألوان دلالية، مساحات مريحة،
  touch targets كبيرة، ظلال وحركة مقيدتان، وتسلسل حالة واضح.
- توحيد primitives للهاتف لحالات pressed/focused/disabled/loading/error/success ودعم RTL/LTR.
- تطوير لوحة Admin عربية أولًا بجداول responsive، فلاتر، status badges، loading/empty/error states،
  وإجراءات واعية بالصلاحيات.
- لم تُنسخ شعارات أو أصول أو backend/business logic من المراجع الخارجية؛ التوثيق يوضح الرخص
  والاستخدام كمرجع تفاعلي فقط.
- تمت مواءمة تطبيق Android مع إصدارات التصحيح الرسمية لـ Expo 57.0.17 وReact Native 0.86.3؛
  نجح Expo Doctor بنتيجة 21/21 وفحص التصدير المحلي.

### العميل | Customer

- ترحيب ومصادقة واستعادة بدء أوضح.
- منزل يركز على `اطلب خدمة` والفئات والطلبات الحالية والإشعارات والدعم.
- رحلة طلب خطوة بخطوة: الخدمة → تشخيص AI بالنص/الصورة/الصوت → تأكيد التفريغ → الاستيضاح →
  الموقع → الوقت → المراجعة → النشر.
- عروض أوضح مع مقدم الخدمة والتحقق والتقييم والوقت والضمان والتكاليف ذات الصلة.
- timeline لحالة المهمة، ورسائل ومرفقات وحالات offline/retry، ثم الإكمال والتقييم والدعم.

### مقدم الخدمة | Provider

- dashboard للحالة والتوثيق والتوفر والطلبات المؤهلة والعروض والمهمة الحالية.
- onboarding واضح للخدمات والمنطقة والتوفر والمستندات والمراجعة.
- feed يعرض المنطقة التقريبية والتوقيت والاستعجال والموجز الأصلي/المترجم، من دون كشف الموقع
  الدقيق قبل التفويض.
- إنشاء عرض ومتابعة المهمة والتغيير والإكمال والنزاع بحالات تحميل/فراغ/خطأ/offline/retry محسنة.
- لا تغيير في شرط توثيق مقدم الخدمة أو اعتماد الخدمة أو عروض المنافسين المختومة.

### المسؤول | Admin

- لوحة عمليات مهنية للعملاء ومقدمي الخدمات والمستندات والمراجعة والدعم والإشعارات والصحة.
- navigation عربية أولًا، جداول واضحة، حالات منقحة، تأكيدات للأفعال، وإبقاء التفويض من الخادم.
- لا يوجد service-role في المتصفح ولا استبدال للتفويض بإخفاء عناصر UI.

## حالة خدمات Preview | Preview service status

| الخدمة                                      | الحالة في هذا المرشح                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Supabase Auth/DB/Storage/Edge               | **ACTIVE**                                                                  |
| Storage S3 signer                           | **ACTIVE** — server-side only؛ العامل والعميل بلا credentials طويلة العمر.  |
| DigitalOcean Scanner + ClamAV               | **ACTIVE** — صورة وصوت نظيفان PASS، وEICAR رفض PASS، cleanup PASS.          |
| OpenAI text/image/transcription/translation | **ACTIVE** — canaries اصطناعية في Preview PASS.                             |
| Push                                        | **BUILD READY / PARTIAL** — يلزم `EXPO_ACCESS_TOKEN` وإثبات receipt موثوق.  |
| Maps                                        | **EMULATOR VERIFIED** — physical GPS accuracy NOT RUN.                      |
| Monitoring                                  | **PARTIAL** — صحة وسجلات منقحة متاحة؛ full alert delivery drill مؤجل.       |
| Backup                                      | **RUNBOOK READY** — Free plan export موثق؛ `FORMAL_RESTORE_DRILL_DEFERRED`. |

## التوافق والإتاحة | Localization and accessibility

- العربية هي لغة التصميم الأساسية؛ الإنجليزية والأردية والهندية تبقى مدعومة.
- العربية والأردية RTL، والإنجليزية والهندية LTR.
- design tokens ومكونات الحالة تراعي labels، ترتيب focus، touch targets، contrast، font scaling،
  keyboard avoidance، reduced motion، ورسائل الخطأ.
- مصفوفة قارئ الشاشة والأجهزة الفعلية الكاملة مؤجلة إلى تدقيق ما قبل الإطلاق، ولا تُسجل كـ PASS.

## دليل Preview الحالي | Current Preview evidence

- customer/provider/admin Preview accounts are operational with synthetic data.
- مقدم الخدمة موثق، خدمة `air-conditioning` معتمدة، منطقة الرياض 40 كم، ويقبل الطلبات؛ matching
  وfeed نجحا سابقًا.
- Android Studio Emulator customer startup, all customer tabs, request-creation return, repeat
  launch, and customer/provider role switching are **PASS** on the repaired exact-head APK.
- The focused production-route regression plus existing route/recovery suite passed `21/21`; mobile
  lint, mobile typecheck, Expo compatibility, Expo Doctor `21/21`, and Android local export passed.
- Scanner/ClamAV clean image, clean audio remux, EICAR rejection, and cleanup PASS.
- OpenAI text, clean image, transcription, and translation canaries PASS.
- Push physical receipt and physical GPS accuracy are **NOT RUN**.

## قيود مقصودة | Intentional exclusions

- لا مدفوعات أو دفعات أو تسوية مالية.
- لا background location أو SMS OTP أو dynamic pricing.
- لا Production deployment، ولا App Store/Google Play submission.
- لا ادعاء iOS build من دون Apple signing صالح.

## مؤجل إلى المرحلة التالية | Deferred final pre-launch audit

- full Codex Security and deep security review؛
- full database/RLS and OWASP API/mobile/LLM audits؛
- physical device matrix؛
- formal backup restore and full monitoring alert drills؛
- legal/privacy/store compliance؛
- public store submission.

## ملاحظات الترقية والتراجع | Upgrade and rollback notes

- هذا المرشح فرع طفل من Feature Complete Preview؛ لا يعيد كتابة تاريخ الفرع الأب.
- عند فشل خدمة خارجية، تبقى المسارات fail-closed وتعرض حالة آمنة بدل نجاح وهمي.
- يمكن الرجوع إلى SHA الأب المسجل مع إبقاء بيانات Preview والترحيلات forward-only؛ لا تُعدّل migration
  مطبقة ولا تُرقّى وسائط quarantine يدويًا.
- هوية APK القابلة للتوزيع وSHA-256 والحزمة والإصدار وEAS build ID مسجلة أعلاه. يبقى استخدامها
  محصورًا في Preview/closed beta ولا يمثل نشر Production أو إرسال متجر.

English summary: the release candidate adds a coherent professional Arabic-first customer,
provider, and admin experience while keeping Supabase authority, sealed offers, exact-location
privacy, private-media scanning, and server authorization unchanged. The repaired Android APK
passes customer navigation and dual-role switching on the emulator. Scanner and OpenAI retain live
synthetic Preview evidence; Maps is emulator verified; Push receipt, physical devices, restore and
alert drills, the final audit, and stores remain explicitly pending.
