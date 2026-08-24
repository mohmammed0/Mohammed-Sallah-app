# الاختبارات والتحقق

[المرجع الإنجليزي](../TESTING.md) · [التوثيق العربي](README.md)

## الفحوص الأساسية

| الغرض                             | الأمر                                      |
| --------------------------------- | ------------------------------------------ |
| التوثيق                           | `pnpm docs:check`                          |
| التنسيق والأنواع والوحدات والبناء | `pnpm validate`                            |
| التكامل بين الحزم                 | `pnpm test:integration`                    |
| Supabase المحلي                   | `pnpm test:local-supabase`                 |
| فحص الوسائط V2 المحلي             | `pnpm test:media-scanner:supabase`         |
| ذاكرة Edge لمسار التحكم           | `pnpm test:edge-memory`                    |
| الحاوية وClamAV والحدود           | `pnpm test:media-scanner`                  |
| Remux الحقيقي للصوت والفيديو      | `pnpm test:media-scanner:remux`            |
| بوابات CI لفحص الوسائط            | `pnpm test:media-scanner:gates`            |
| قاعدة البيانات وRLS               | `pnpm test:db`                             |
| Edge Functions                    | `pnpm test:functions`                      |
| الأمن                             | `pnpm test:security && pnpm security:scan` |
| E2E للويب                         | `pnpm test:e2e:web`                        |
| E2E للجوال                        | `pnpm test:e2e:mobile`                     |

## قواعد الدليل

- يجب تسجيل الأمر والرأس والبيئة والنتيجة.
- PASS يخص الأمر الذي شغل فعلاً فقط.
- غياب Docker أو المتصفح أو المحاكي أو الجهاز أو الاعتماد يعني NOT RUN.
- تصدير Android لا يساوي اختبار جهاز فعلي.
- الاختبار المحلي أو المزود الحتمي لا يساوي خدمة إنتاجية.
- اختبار Supabase الخفيف يثبت الطابور وإعادة التشغيل والصلاحية بإعداد test صريح؛ دليل الفحص الحقيقي
  يبقى في بوابة `pnpm test:media-scanner:supabase` المنفصلة.
- اختبار فحص الوسائط يستخدم Supabase وStorage وEdge وClamD محلياً فقط؛ لا يثبت استضافة أو
  تفعيلاً إنتاجياً.
- شرط metadata-only يخص مسار تحكم الفحص فقط. يبقى `media-access` وسيط بث يعيد التحقق من الصلاحية،
  أما نقل الوسائط إلى مزودي AI والتفريغ فهو بوابة M3 منفصلة.
- تغيير RLS أو RPC يتطلب حالة مسموحة وحالات منع متقاطعة.

## قبل تسليم تغيير

شغل أصغر فحص أثناء التطوير ثم اختم بـ `pnpm validate`. تغييرات قاعدة البيانات تتطلب
`supabase db reset` و`pnpm test:db` عند توفر Docker. اذكر صراحةً كل بوابة لم تُشغل.
