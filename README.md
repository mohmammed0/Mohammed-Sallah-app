# صَلَح | SALLAH

[العربية](README.ar.md) · [English](README.en.md)

منصة سعودية عربية أولاً لتنظيم سوق خدمات محلية بين العملاء ومقدمي الخدمات الموثقين وفرق
التشغيل. يضم المستودع تطبيق Expo للجوال، وموقع Next.js عاماً ولوحة تشغيل، وعقود TypeScript
مشتركة، وخلفية Supabase مرجعية.

SALLAH is an Arabic-first Saudi local-services marketplace with an Expo mobile app, a public and
operations Next.js web app, shared TypeScript contracts, and an authoritative Supabase backend.

> **الحالة الحالية:** مرشح نسخة تجريبية مغلقة يعمل في Preview ويخضع الآن لإغلاق هندسي وحزمة
> تسليم متعددة الأدوات. اكتملت عقود الثقة، وفحص الوسائط، والذكاء الاصطناعي، ورحلات العميل
> ومقدم الخدمة والإدارة في فروع Draft المتسلسلة. لا يعني ذلك جاهزية Production أو المتاجر أو
> الجهاز الفعلي. راجع [حالة النسخة التجريبية](docs/status/CLOSED_BETA.md) و
> [حزمة التسليم](docs/handoff/README.md).
>
> **Current status:** an operational Preview closed-beta candidate is undergoing engineering
> finalization and multi-tool handoff. Trust, media scanning, AI, and customer/provider/admin
> repository journeys are implemented in the stacked Draft PR chain. This does not establish
> Production, store, or physical-device readiness.

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
- [حزمة التسليم متعددة الأدوات](docs/handoff/README.md)
- [التطوير المحلي](docs/ar/LOCAL_DEVELOPMENT.md)
- [الاختبارات](docs/ar/TESTING.md)
- [المدخلات البشرية المطلوبة](docs/ar/HUMAN_INPUTS.md)
- [المساهمة | Contributing](CONTRIBUTING.md)
- [الأمن | Security](SECURITY.md)

هذا مشروع مملوك المصدر ما لم ينشر مالك المستودع ترخيصاً صريحاً. تبقى تبعيات الجهات الخارجية
خاضعة لتراخيصها؛ راجع [إشعارات الجهات الخارجية](THIRD_PARTY_NOTICES.md).
