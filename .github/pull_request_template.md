## الملخص | Summary

- ما الذي تغير؟ | What changed?
- لماذا يلزم للنسخة التجريبية؟ | Why is it needed for closed beta?
- ما الذي بقي خارج النطاق؟ | What remains out of scope?

## الأسطح | Surfaces

- [ ] تطبيق العميل | Customer mobile
- [ ] تطبيق مقدم الخدمة | Provider mobile
- [ ] الموقع العام | Public web
- [ ] لوحة التشغيل | Operations portal
- [ ] Supabase / RLS / RPC / Edge
- [ ] التوثيق أو CI فقط | Docs or CI only

## قاعدة البيانات | Database

- Migrations الجديدة أو `None`:
- ملخص RLS/RPC والاختبارات المتقاطعة:
- أنواع قاعدة البيانات مولدة بلا drift:

## الأمن والخصوصية | Security and privacy

- حدود الثقة المتأثرة | Affected trust boundaries:
- البيانات الشخصية/الموقع/الوسائط/العروض/الأدوار:
- التهديدات أو المخاطر المتبقية:

> لا تضع أسراراً أو حسابات حقيقية أو PII أو موقعاً دقيقاً أو مستندات أو رسائل أو وسائط خاصة أو
> بيانات دفع في PR.
>
> Never include secrets, real accounts, PII, exact locations, documents, messages, private media,
> or payment data.

## اللغة وإتاحة الوصول | Localization and accessibility

- العربية RTL والإنجليزية/الأردية/الهندية:
- لوحة المفاتيح والتركيز والنص الكبير وقارئ الشاشة:

## OSS وسلسلة التوريد | OSS and supply chain

- Dependency/version/license changes or `None`:
- Inventory/notices/lockfile:

## التحقق | Validation

| الأمر أو البوابة | PASS / FAIL / NOT RUN | الرأس والبيئة | الدليل/الملاحظات |
| ---------------- | --------------------- | ------------- | ---------------- |
| `pnpm validate`  |                       |               |                  |
| فحوص النطاق      |                       |               |                  |
| الجهاز الفعلي    |                       |               |                  |

## المدخلات البشرية | Human inputs

- القرارات أو الحسابات أو الاعتمادات أو الأجهزة المطلوبة:

## الصور والأدلة | Screenshots and evidence

- Web:
- Mobile/device:
- لا تمثل capture آلياً كصورة جهاز فعلي.

## التراجع | Rollback

- التطبيق/feature flags:
- migration تعويضية أو استعادة معتمدة:

## التأكيد | Confirmation

- [ ] لم أتخلص من عمل مستخدم | No user work was discarded
- [ ] لا يوجد سر إنتاج أو بيانات شخصية | No production secret or personal data
- [ ] النتائج PASS/FAIL/NOT RUN صادقة | Results are reported honestly
- [ ] لم أمثل sandbox أو demo كإنتاج | No sandbox/demo is represented as production
- [ ] لم أعد كتابة migration أو Git history | No migration or Git history was rewritten
