# التطوير المحلي

[المرجع الإنجليزي](../LOCAL_DEVELOPMENT.md) · [التوثيق العربي](README.md)

المرجع التفصيلي للأوامر والحسابات المحلية هو
[docs/LOCAL_DEVELOPMENT.md](../LOCAL_DEVELOPMENT.md). يلخص هذا الدليل المسار الآمن.

## المتطلبات

- Node.js 24 LTS
- Corepack وpnpm 11.19.0
- Docker Desktop
- Supabase CLI 2.114.0
- Android Studio أو Xcode فقط عند اختبار هدف أصلي

## البدء

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
supabase start
supabase db reset
supabase status
pnpm dev
```

استخدم URL ومفتاح النشر المحليين اللذين يطبعهما `supabase status`. لا تنسخ المفتاح السري
المحلي إلى `NEXT_PUBLIC_*` أو `EXPO_PUBLIC_*`. البريد المحلي يصل إلى Mailpit، وبيانات
`supabase/seed.demo.sql` للاختبار المحلي فقط ولا تنشر إلى الإنتاج.

## تغييرات قاعدة البيانات

1. أنشئ migration جديدة باسم زمني؛ لا تعدل migration مطبقة.
2. شغل `supabase db reset`.
3. شغل `pnpm test:db` وأضف اختبارات السماح والمنع للأدوار المتقاطعة.
4. ولد أنواع `public` من Supabase المحلي.
5. نسق الملف وتأكد من عدم بقاء drift في
   `packages/database/src/database.types.ts`.

## البيئة المحلية

- الحسابات المحلية تستخدم نطاق `.invalid` ولا تمثل مستخدمين حقيقيين.
- المزود الحتمي للذكاء الاصطناعي أداة اختبار وليس دليلاً على تكامل إنتاجي.
- شغل أوامر المستودع من runtime واحد في Windows/WSL لتفادي اختلاف المسارات.
- أوقف البيئة عند الانتهاء باستخدام `supabase stop`.

للمتغيرات والحدود راجع [Environment contract](../ENVIRONMENT.md).
