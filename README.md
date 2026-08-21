# صَلَح | SALLAH

[العربية](README.ar.md) · [English](README.en.md)

منصة سعودية عربية أولاً لتنظيم سوق خدمات محلية بين العملاء ومقدمي الخدمات الموثقين وفرق
التشغيل. يضم المستودع تطبيق Expo للجوال، وموقع Next.js عاماً ولوحة تشغيل، وعقود TypeScript
مشتركة، وخلفية Supabase مرجعية.

SALLAH is an Arabic-first Saudi local-services marketplace with an Expo mobile app, a public and
operations Next.js web app, shared TypeScript contracts, and an authoritative Supabase backend.

> **الحالة الحالية:** تجهيز نسخة تجريبية مغلقة. اكتمل M1 الخاص بالثقة وسلامة المحتوى وجُمّد
> عند الرأس المعتمد، بينما اختيرت بنية M2 لفحص الوسائط ولم يبدأ تنفيذها. لا يعني نجاح فحوص
> المستودع اكتمال اختبارات الأجهزة أو المدخلات البشرية أو جاهزية الإنتاج. راجع
> [حالة النسخة التجريبية المغلقة](docs/status/CLOSED_BETA.md).
>
> **Current status:** closed-beta readiness. M1 trust and UGC safety is complete and frozen; M2
> media-scanning architecture is selected and implementation has not started. Repository checks do
> not imply device, human-input, or production readiness.

## الأسطح الرئيسية

- تطبيق جوال للعميل ومقدم الخدمة باللغات العربية والإنجليزية والأردية والهندية، مع RTL/LTR.
- موقع عام ولوحة تشغيل تعتمد التفويض من الخادم.
- Supabase مرجعي لقواعد البيانات وRLS وRPC وRealtime وStorage وEdge Functions.
- حزم مشتركة لقواعد النطاق والعقود والأنواع والترجمة والإعداد والمراقبة.

## حدود الثقة

- تبقى المواقع الدقيقة خاصة حتى الاختيار المصرح به.
- تبقى العروض مختومة عن مقدمي الخدمات المنافسين.
- تمر التحولات الحساسة عبر أوامر خادم ذرية وقابلة لإعادة المحاولة ومدققة.
- لا تدخل مفاتيح الخدمة أو الذكاء الاصطناعي إلى تطبيقات العميل.
- مخرجات الذكاء الاصطناعي إرشادية، محدودة بعقد، وقابلة للتحرير وليست نشرًا تلقائيًا.

## ابدأ من هنا

- [الدليل العربي الكامل](README.ar.md)
- [Full English guide](README.en.md)
- [فهرس التوثيق | Documentation map](docs/README.md)
- [التطوير المحلي](docs/ar/LOCAL_DEVELOPMENT.md)
- [الاختبارات](docs/ar/TESTING.md)
- [المدخلات البشرية المطلوبة](docs/ar/HUMAN_INPUTS.md)
- [المساهمة | Contributing](CONTRIBUTING.md)
- [الأمن | Security](SECURITY.md)

هذا مشروع مملوك المصدر ما لم ينشر مالك المستودع ترخيصاً صريحاً. تبقى تبعيات الجهات الخارجية
خاضعة لتراخيصها؛ راجع [إشعارات الجهات الخارجية](THIRD_PARTY_NOTICES.md).
