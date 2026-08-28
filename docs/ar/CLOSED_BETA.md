# حالة النسخة التجريبية المغلقة

[المصدر الثنائي الحالي](../status/CLOSED_BETA.md) · [التوثيق العربي](README.md)

هذه الصفحة تشرح الحالة بالعربية؛ عند تحديث حالة milestone يجب تحديث
[المصدر الثنائي الحالي](../status/CLOSED_BETA.md) أولاً.

## أين نحن؟

- M1 للثقة وسلامة المحتوى **مكتمل ومجمّد** في Draft PR #17.
- R1 في Draft PR #24 وD1 في Draft PR #25 منشوران كفروع أبناء غير مدمجة.
- M2 لفحص الوسائط **مكتمل في المستودع وHosted CI** عند
  `03c35255514f4a2aba008a86912eaf38b0029eca` في Draft PR #26. يعمل ماسح Preview الخارجي
  outbound-only مع Storage، والصورة والصوت وEICAR والتنظيف لها أدلة اصطناعية مسجلة.
- المسار المحلي يفك ترميز JPEG/PNG/WebP ويعيد ترميزها، ويطبق Remux فعلياً ومحدوداً على
  M4A/MP4 الصوت وMP4 فيديو الإكمال؛ WebM وPDF مغلقان عند الفشل. ClamAV كشف برمجيات خبيثة
  وليس CDR.
- اكتملت مسارات العميل ومقدم الخدمة والإدارة، ونجحت canaries الاصطناعية لـOpenAI في Preview
  للنص والصورة والصوت والترجمة. تبقى معالجة بيانات الإنتاج والموافقات القانونية بوابة منفصلة.
- إعداد Push وFCM/EAS موجود، لكن إيصال Push فعلياً على جهاز **NOT RUN**.
- يوجد APK Preview موثق، وMaps مقيد بالحزمة وSHA-1 وتحقق على المحاكي. GPS والدفع الفعلي
  والإتاحة على جهاز حقيقي **NOT RUN**.
- الإنتاج والمتاجر والخدمات المدفوعة وM10 iOS ليست نتيجة ضمن التسليم الهندسي الحالي.

## روابط القرار

- [المتعقب الرئيسي #23](https://github.com/mohmammed0/Mohammed-Sallah-app/issues/23)
- [مرشح الإصدار الأب PR #7](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/7)
- [M1 المجمد PR #17](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/17)
- [تنظيم R1 الثنائي PR #24](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/24)
- [محاذاة Expo في D1 PR #25](https://github.com/mohmammed0/Mohammed-Sallah-app/pull/25)

## كيف نقرأ الأدلة؟

- **PASS:** فحص محدد نجح على رأس وبيئة محددين.
- **NOT RUN:** لا يوجد تنفيذ أو دليل؛ لا يمكن اعتباره نجاحاً.
- **HUMAN INPUT REQUIRED:** يلزم شخص مخول أو اعتماد أو حساب أو جهاز أو قيمة حقيقية.
- **OUT OF BETA SCOPE:** مؤجل صراحة خارج بوابة beta الأولى.

كل milestone فرع ابن محدود من رأس beta المعتمد، ويعود إلى فرع التكامل بعد المراجعة. لا يذهب
العمل مباشرة إلى `main`.
