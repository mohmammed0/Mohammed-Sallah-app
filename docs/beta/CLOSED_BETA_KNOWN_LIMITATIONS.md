# القيود المعروفة للنسخة التجريبية المغلقة | Closed Beta Known Limitations

**آخر تحديث مرجعي:** 2026-08-27
هذه القائمة تفصل بدقة بين القيود المقبولة للبيتا وبين العطل الوظيفي. `NOT RUN` لا تعني `PASS`.

This document records accepted closed-beta constraints. It does not waive authorization, privacy,
scanner, RLS, localization, or accessibility requirements.

## إصلاح مانع Android وهوية التوزيع | Android blocker resolved

- عُزل سبب `Maximum update depth exceeded`: كان مسار التبويب `/customer-home` يعيد تصدير شاشة
  `/home` القديمة، بينما أصبحت `/home` تعيد التوجيه إلى `/customer-home`. أدى ذلك إلى حلقة
  `/customer-home → Redirect('/customer-home') → تحديث navigator → إعادة تركيب /customer-home`.
- أصبح تبويب العميل يملك شاشة `CustomerHome` مباشرة، مع إبقاء `/home` مسار انتقال قديم أحادي
  الاتجاه. لم تتغير حماية المسارات أو شاشات التصميم الاحترافي أو قواعد الأدوار.
- يغطي regression الجديد شجرة مسار العميل الفعلية وملكية الشاشة، ونجحت اختبارات المسارات المركزة
  `21/21` مع lint وtypecheck والتصدير المحلي.
- APK القابلة للتوزيع مبنية من SHA
  `191ec64901e5c231306cd3f14048a4c36ac3a163`، EAS build
  `208ab028-3796-45aa-99c3-ec9992298008`، الحزمة `com.mohmammed0.sallah.preview`، الإصدار
  `0.1.0` و`versionCode 13`، وSHA-256
  `8758f6d42304991012c19e6467d1c7927c377cb5e5ccf9d9a06187603b1ad653`.
- نجح على Android Studio Emulator: دخول العميل، الصفحة الرئيسية، التبويبات الأربعة، فتح إنشاء
  الطلب والعودة، الخروج والدخول، إعادة التشغيل مرتين، وتبديل الحساب المزدوج عميل ↔ مقدم خدمة مع
  فتح موجز مقدم الخدمة. لم يظهر recovery أو maximum-depth أو fatal process exit.

English: the customer tab now renders the real `CustomerHome` screen instead of re-exporting the
legacy redirect route. The repaired exact-head APK passed customer tabs, repeat launch, and
dual-role switching on the Android Studio Emulator. Physical-device coverage remains deferred.

## خدمات Preview | Preview services

### Push — إعداد جزئي | Partial configuration

- منطق token lifecycle والتفضيلات والretry وdead-letter والعامل والجدولة موجود في Preview.
- تمت محاذاة إعدادات العامل السرية الأساسية من دون وضعها في العميل أو Git.
- ما يزال `EXPO_ACCESS_TOKEN` إدخالًا مملوكًا للحساب؛ لا يجوز اختلاقه أو استخدام EAS session token
  بدلًا منه.
- لا يوجد token جهاز نشط معتمد في الدليل الحالي، لذلك إيصال Push والاستلام/الفتح في الخلفية لم
  يُثبتا بعد.
- **PHYSICAL_PUSH_RECEIPT_NOT_RUN**؛ ولا تُعرض Push كخدمة `ACTIVE` حتى نجاح إيصال موثوق.

### Maps — محاكي فقط | Emulator verified only

- خريطة Android عُرضت بنجاح على محاكي Android Studio المزود بخدمات Google Play.
- مفتاح Preview مقيد بحزمة التطبيق وشهادة التوقيع، ولا يوجد مفتاح Maps في Git.
- صلاحية الموقع الأمامي وحالات الرفض/إعادة المحاولة مدعومة؛ لا يوجد طلب background location.
- **PHYSICAL_GPS_ACCURACY_NOT_RUN**؛ دقة GPS والاتجاه والظروف الواقعية تحتاج جهازًا فعليًا لاحقًا.

### Scanner وClamAV — نشط في Preview | Active in Preview

- عامل DigitalOcean outbound-only وClamAV يعملان من دون منافذ Scanner أو ClamD عامة.
- نجح مسار صورة نظيفة، ومسار صوت نظيف مع remux، ورفض EICAR، والتنظيف ببيانات اصطناعية.
- استمرار الخدمة يعتمد على freshness أقل من 24 ساعة، موارد المضيف، scheduler التنظيفي، واتصال
  Preview. غياب أي شرط يبقي الوسائط في quarantine ويفشل مغلقًا.
- هذه الأدلة لا تمثل اختبار حمل أو failover أو تشغيلًا إنتاجيًا.

### OpenAI — نشط في Preview بحدود beta | Active with beta limits

- نجحت canaries الاصطناعية لتشخيص النص والصورة والتفريغ الصوتي وترجمة موجز مقدم الخدمة.
- الطلبات محدودة بالمهلة والمحاولات والحجم؛ لا تُرسل مفاتيح OpenAI إلى العميل.
- quota/model/rate-limit/5xx تبقى أعطال مزود خارجية محتملة، ويجب عرض provider unavailable بأمان.
- لم يُنفذ تدقيق prompt-injection/LLM شامل؛ لا يجوز التعامل مع نتيجة AI كقرار نشر دون مراجعة العميل.

### المراقبة والتنبيهات | Monitoring and alerts

- صحة Docker والحاويات ودوران السجلات ومساحة القرص والذاكرة متاحة على مضيف الماسح.
- صحة AI/Scanner/Push/cleanup تظهر كفئات منقحة في الأسطح التشغيلية المتاحة.
- تكامل وجهة تنبيه خارجية واختبار إيصال alert من الطرف إلى الطرف لم يثبتا بعد.
- **FULL_MONITORING_ALERT_DRILL_DEFERRED**.

### النسخ الاحتياطي | Backup readiness

- مشروع Supabase Preview على الخطة المجانية؛ لم تُفعّل PITR أو استعادة مدفوعة.
- توجد إجراءات تصدير واستعادة معزولة، لكن لا يوجد دليل formal restore حالي.
- كائنات Storage تحتاج نسخة مستقلة؛ استعادة قاعدة البيانات لا تعيد bytes الخاصة بها.
- **FORMAL_RESTORE_DRILL_DEFERRED**.

## حدود الجهاز والبناء | Device and build limits

- Android Studio Emulator هو بيئة التحقق الحالية؛ تشغيل مساحة العميل وتبويباتها وتبديل الدور في
  APK الدقيقة أعلاه **PASS**، ومصفوفة الأجهزة الفعلية غير منفذة.
- receipt الفعلي لـPush، دقة GPS الواقعية، ظروف الشبكة الخلوية، الكاميرا/الميكروفون على أجهزة متعددة،
  وإدارة الذاكرة طويلة المدة مؤجلة.
- إعداد iOS يمكن أن يكون جاهزًا، لكن البناء يحتاج Apple signing/team صالحًا؛ لا توجد صلاحية لشراء
  عضوية أو إرسال App Store.
- لا يوجد إرسال عام إلى Google Play أو App Store ضمن النسخة المغلقة.

## قيود المنتج المقصودة | Intentional product scope

- لا توجد مدفوعات إلكترونية للعملاء، دفعات آلية لمقدمي الخدمات، تسوية أو مصالحة مالية.
- البريد الإلكتروني يكفي للمصادقة الحالية؛ SMS OTP خارج النطاق.
- لا يوجد تتبع موقع بالخلفية أو dynamic pricing أو analytics واسعة.
- لا يُعرض الموقع الدقيق لمقدم الخدمة قبل حالة المهمة المصرح بها.
- المنافسون لا يرون عروض بعضهم، ولا تُختصر مراجعة مقدم الخدمة أو الخدمة.

## مؤجل إلى تدقيق ما قبل الإطلاق | Deferred final audit

- full Codex Security؛
- full database/RLS audit؛
- OWASP API/mobile/LLM review؛
- physical device matrix؛
- backup restore drill؛
- full monitoring alert drill؛
- legal/privacy/store compliance؛
- public App Store/Google Play submission.

English summary: the repaired Android closed-beta APK passes customer navigation and dual-role
switching on the emulator. Scanner, ClamAV, Storage, and OpenAI retain synthetic Preview evidence;
Maps is emulator verified. Push lacks authoritative physical receipt evidence. Physical devices,
restore/alert drills, final security review, legal review, and stores remain explicitly deferred.
