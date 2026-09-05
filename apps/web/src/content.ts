export type PublicLocale = 'ar' | 'en';
export const pages = {
  'how-it-works': {
    ar: [
      'كيف تعمل صلّح',
      'صف المشكلة، راجع المسودة، قارن العروض الخاصة، ثم تابع العمل حتى القبول.',
    ],
    en: [
      'How SALLAH works',
      'Describe the issue, review the draft, compare sealed offers, and follow the job through acceptance.',
    ],
  },
  customers: {
    ar: [
      'خدمة أوضح وأكثر أمانًا',
      'طلبات منظمة، عروض قابلة للمقارنة، وعنوانك الدقيق يبقى خاصًا حتى اختيار مقدم الخدمة.',
    ],
    en: [
      'Clearer, safer service',
      'Structured requests, comparable offers, and an exact address kept private until provider selection.',
    ],
  },
  providers: {
    ar: ['نمِ أعمالك باحتراف', 'طلبات مناسبة لنطاقك، موجز مترجم، وعروض خاصة لا يراها المنافسون.'],
    en: [
      'Grow professionally',
      'Eligible local requests, translated briefs, and private offers hidden from competitors.',
    ],
  },
  services: {
    ar: [
      'الخدمات المدعومة',
      'تكييف، سباكة، كهرباء، أجهزة، تنظيف، دهان، نجارة، مكافحة آفات، نقل، تنسيق حدائق، ترميم وأكثر.',
    ],
    en: [
      'Supported services',
      'AC, plumbing, electrical, appliances, cleaning, painting, carpentry, pest control, moving, landscaping, renovation, and more.',
    ],
  },
  cities: {
    ar: [
      'المدن',
      'تبدأ بيانات الإطلاق التجريبي بالرياض، مع كتالوج مدن وأحياء قابل للإدارة دون إصدار تطبيق جديد.',
    ],
    en: [
      'Cities',
      'Pilot data starts with Riyadh; cities and districts are configurable without a new app release.',
    ],
  },
  safety: {
    ar: [
      'السلامة أولًا',
      'الاقتراحات الآلية لا تستبدل المختص. ابتعد عن الخطر واتبع تعليمات الطوارئ المعتمدة محليًا.',
    ],
    en: [
      'Safety first',
      'Automated suggestions do not replace a professional. Move away from danger and follow reviewed local emergency guidance.',
    ],
  },
  help: {
    ar: ['مركز المساعدة', 'يمكنك فتح حالة دعم وربطها بطلب أو عمل وإرفاق الأدلة ومتابعة القرار.'],
    en: [
      'Help center',
      'Open a support case, link it to a request or job, attach evidence, and follow its resolution.',
    ],
  },
  contact: {
    ar: [translate('ar', 'publicContact'), translate('ar', 'publicContactUnavailable')],
    en: [translate('en', 'publicContact'), translate('en', 'publicContactUnavailable')],
  },
  privacy: {
    ar: [translate('ar', 'privacy'), translate('ar', 'publicLegalUnavailable')],
    en: [translate('en', 'privacy'), translate('en', 'publicLegalUnavailable')],
  },
  terms: {
    ar: [translate('ar', 'terms'), translate('ar', 'publicLegalUnavailable')],
    en: [translate('en', 'terms'), translate('en', 'publicLegalUnavailable')],
  },
  cancellation: {
    ar: [
      'سياسة الإلغاء',
      'يُقيّم الإلغاء حسب مرحلة العمل، وتُسجل القرارات والأسباب والآثار المالية.',
    ],
    en: [
      'Cancellation policy',
      'Cancellation depends on job state; decisions, reasons, and financial implications are audited.',
    ],
  },
  'provider-standards': {
    ar: [
      'معايير مقدمي الخدمة',
      'التحقق، المهنية، سلامة العملاء، دقة العروض، والالتزام بنطاق العمل شروط تشغيلية أساسية.',
    ],
    en: [
      'Provider standards',
      'Verification, professionalism, safety, accurate offers, and scope adherence are core operating requirements.',
    ],
  },
  'community-standards': {
    ar: [translate('ar', 'publicCommunityStandards'), translate('ar', 'publicLegalUnavailable')],
    en: [translate('en', 'publicCommunityStandards'), translate('en', 'publicLegalUnavailable')],
  },
  'data-export': {
    ar: ['تصدير البيانات', 'اطلب حزمة خاصة موقعة مؤقتًا من إعدادات حسابك أو نموذج الدعم.'],
    en: [
      'Data export',
      'Request a private, expiring export package from account settings or support.',
    ],
  },
} as const;
export type PublicSlug = keyof typeof pages;
import { translate } from '@sallah/i18n';
