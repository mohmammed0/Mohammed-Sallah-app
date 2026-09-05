# صَلَح | SALLAH

[العربية](README.ar.md) · [English](README.en.md)

منصة سعودية عربية أولاً لتنظيم سوق خدمات محلية بين العملاء ومقدمي الخدمات الموثقين وفرق
التشغيل. يضم المستودع تطبيق Expo للجوال، وموقع Next.js عاماً ولوحة تشغيل، وعقود TypeScript
مشتركة، وخلفية Supabase مرجعية.

SALLAH is an Arabic-first Saudi local-services marketplace with an Expo mobile app, a public and
operations Next.js web app, shared TypeScript contracts, and an authoritative Supabase backend.

> **الحالة الحالية:** دُمج تجهيز الكود وGitHub قبل الإطلاق عبر
> [PR #36](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/36) في `main`.
> يبدأ العمل الجديد من رأس `main` النظيف مع فحوصه المطابقة؛ تبقى الطلبات السابقة أدلة تاريخية محفوظة.
> راجع [دليل ما قبل الإطلاق](docs/release/PRELAUNCH.md) و
> [حالة النسخة التجريبية](docs/status/CLOSED_BETA.md). تبقى موافقات الإنتاج والمتاجر
> والتحقق على الأجهزة الفعلية بوابات منفصلة.
>
> **Current status:** code and GitHub prelaunch preparation was merged into `main` through
> [PR #36](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/36).
> New work starts from clean `main` with matching checks; earlier pull requests remain preserved historical evidence.
> See the [prelaunch guide](docs/release/PRELAUNCH.md) and
> [closed-beta status](docs/status/CLOSED_BETA.md). Production and store approvals and
> physical-device validation remain separate gates.

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
- [تجهيز الكود وGitHub قبل الإطلاق | Prelaunch guide](docs/release/PRELAUNCH.md)
- [حزمة التسليم متعددة الأدوات](docs/handoff/README.md)
- [التطوير المحلي](docs/ar/LOCAL_DEVELOPMENT.md)
- [الاختبارات](docs/ar/TESTING.md)
- [المدخلات البشرية المطلوبة](docs/ar/HUMAN_INPUTS.md)
- [المساهمة | Contributing](CONTRIBUTING.md)
- [الأمن | Security](SECURITY.md)

هذا مشروع مملوك المصدر ما لم ينشر مالك المستودع ترخيصاً صريحاً. تبقى تبعيات الجهات الخارجية
خاضعة لتراخيصها؛ راجع [إشعارات الجهات الخارجية](THIRD_PARTY_NOTICES.md).
