# المساهمة | Contributing

[العربية](CONTRIBUTING.ar.md) · [English](CONTRIBUTING.en.md)

العربية هي لغة الملاحة والتصميم الأولى، بينما تبقى أسماء الأوامر والمعرفات التقنية بالإنجليزية.
ابدأ من الدليل الموافق للغتك واقرأ [عقد هندسة المستودع](AGENTS.md) قبل التغيير.

Arabic leads repository navigation and product design; commands and technical identifiers remain
English. Start with your language guide and read the [repository engineering contract](AGENTS.md)
before changing anything.

## قواعد لا تختصر | Non-negotiable rules

- استخدم Node 24 LTS وpnpm 11.19.0 وSupabase CLI 2.114.0.
- استخدم Conventional Commits وفروع milestones محدودة من رأس beta المعتمد.
- لا تعدل migration مطبقة؛ أضف migration forward-only مع RLS deny-by-default واختبارات pgTAP.
- حدّث أنواع قاعدة البيانات المولدة وأثبت عدم وجود drift.
- تحقّق من العربية RTL والإنجليزية/الهندية LTR والأردية RTL وإتاحة الوصول.
- لا تضف dependency قبل مراجعة الترخيص والأمن وتحديث OSS inventory والإشعارات وlockfile.
- أبلغ PASS/FAIL/NOT RUN والمدخلات البشرية بصراحة؛ لا تمثل sandbox أو placeholder كإنتاج.
- لا تضع أسراراً أو بيانات شخصية أو مواقع دقيقة أو مستندات أو رسائل أو بيانات دفع في Issue أو PR.

شغّل أصغر فحص أثناء التطوير واختم بـ `pnpm validate`. تغييرات قاعدة البيانات تتطلب أيضاً
`supabase db reset` و`pnpm test:db` عند توفر Docker.
