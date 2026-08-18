import { Link, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { Button, Card, Screen, styles } from '@/components/ui';
const flows: Record<string, { title: string; description: string; steps: string[] }> = {
  offers: {
    title: 'مقارنة العروض',
    description: 'السعر والوصول والمدة والمواد والضمان والتقييم تظهر للعميل فقط.',
    steps: ['راجع أهلية مقدم الخدمة', 'قارن دون ملصق مضلل للأفضل', 'اختر عرضًا واحدًا ذريًا'],
  },
  job: {
    title: 'تفاصيل العمل',
    description: 'الموعد والحالة والمراسلة والموقع المصرح وتغييرات النطاق والإنجاز.',
    steps: ['مجدول', 'في الطريق', 'وصل', 'معاينة', 'تنفيذ', 'إثبات الإنجاز', 'قبول أو نزاع'],
  },
  support: {
    title: 'مركز الدعم',
    description: 'افتح حالة واربطها بالطلب أو العمل وأرفق الدليل الخاص.',
    steps: ['اختيار الموضوع', 'وصف المشكلة', 'رفع دليل', 'متابعة الرد والقرار'],
  },
  onboarding: {
    title: 'تسجيل مقدم الخدمة',
    description: 'فرد أو منشأة، الخدمات والنطاق والتوفر والوثائق والتحقق.',
    steps: ['الهوية والمنشأة', 'الخدمات', 'نطاق الخدمة', 'التوفر', 'وثائق خاصة', 'مراجعة بشرية'],
  },
  feed: {
    title: 'الطلبات المؤهلة',
    description: 'تظهر معلومات المنطقة التقريبية فقط وموجز مترجم مع الأصل عند السماح.',
    steps: ['الفئة والنطاق', 'التوفر والحمل', 'التحقق', 'العلاقات المحظورة'],
  },
  'provider-job': {
    title: 'تنفيذ العمل',
    description: 'آلة حالات يتحكم بها الخادم وتمنع القفز بين المراحل.',
    steps: [
      'في الطريق بموافقة مشاركة الموقع',
      'الوصول والمعاينة',
      'تغيير نطاق رسمي',
      'التنفيذ',
      'رفع الإثبات',
    ],
  },
  earnings: {
    title: 'الأرباح والتسويات',
    description:
      'سجل مالي قابل للتدقيق. الإطلاق الافتراضي دفع بعد الخدمة ولا يدّعي تسوية إلكترونية.',
    steps: ['الإجمالي المعتمد', 'الرسوم القابلة للضبط', 'الحجوزات', 'سجل التسوية'],
  },
};
export default function Flow() {
  const { screen } = useLocalSearchParams<{ screen: string }>();
  const flow = flows[screen] ?? {
    title: 'مسار الخدمة',
    description: 'هذا المسار يتطلب بيانات حساب حقيقية من Supabase.',
    steps: ['تحميل آمن', 'تفويض', 'تنفيذ', 'تدقيق'],
  };
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{flow.title}</Text>
        <Text style={styles.lead}>{flow.description}</Text>
        {flow.steps.map((step, index) => (
          <Card key={step}>
            <Text style={styles.badge}>{index + 1}</Text>
            <Text>{step}</Text>
          </Card>
        ))}
        <Link href="/home" asChild>
          <Button kind="secondary" label="العودة للرئيسية" />
        </Link>
      </Screen>
    </ScrollView>
  );
}
