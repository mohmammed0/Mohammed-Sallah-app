import Link from 'next/link';
import { translate, type TranslationKey } from '@sallah/i18n';
import { requireAdmin, type AdminPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const t = (key: TranslationKey) => translate('ar', key);
const links: ReadonlyArray<readonly [string, string, string, readonly AdminPermission[]]> = [
  ['/admin', 'الرئيسية', 'نظرة عامة', ['dashboard.aggregate.read']],
  ['/admin/customers', 'العملاء', 'بيانات مقيدة', ['customer.pii.read']],
  ['/admin/providers', 'التحقق', 'مقدمو الخدمة', ['provider.document.read']],
  ['/admin/catalog', 'الكتالوج', 'إدارة الخدمات', ['operations.mutate']],
  ['/admin/requests', 'الطلبات', 'طابور الطلبات', ['operations.marketplace.read']],
  ['/admin/jobs', 'الأعمال', 'الأعمال الجارية', ['operations.marketplace.read']],
  [
    '/admin/support',
    'الدعم',
    'الحالات والدعم',
    ['support.case.read', 'operations.marketplace.read'],
  ],
  [
    '/admin/moderation',
    t('adminModerationNavigation'),
    'السلامة والمراجعة',
    ['support.case.read', 'operations.marketplace.read'],
  ],
  ['/admin/finance', 'المالية', 'المراجعات المالية', ['finance.read']],
  ['/admin/audit', 'التدقيق', 'سجل العمليات', ['operations.mutate']],
] as const;
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles, permissions } = await requireAdmin(['dashboard.aggregate.read']);
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="التنقل الإداري">
        <div className="admin-sidebar__brand">
          <Link className="admin-brand" href="/admin">
            <span aria-hidden="true">ص</span>
            <span>
              <strong>صلح</strong>
              <small>مركز العمليات</small>
            </span>
          </Link>
          <span className="admin-environment">إدارة مقيدة</span>
        </div>
        <nav className="admin-nav" aria-label="أقسام العمليات">
          {links
            .filter(([, , , required]) =>
              required.some((permission) => permissions.has(permission)),
            )
            .map(([href, label, description]) => (
              <Link key={href} href={href}>
                <span className="admin-nav__label">{label}</span>
                <span className="admin-nav__description">{description}</span>
              </Link>
            ))}
        </nav>
        <div className="admin-sidebar__footer">
          <span>صلاحيات الجلسة</span>
          <div className="admin-role-list" aria-label="الأدوار النشطة">
            {roles.map((role) => (
              <span className="admin-role-badge" key={role}>
                {role}
              </span>
            ))}
          </div>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-top">
          <div className="admin-top__inner">
            <p>لوحة داخلية · البيانات المعروضة تخضع للصلاحيات</p>
            <span className="admin-status-badge admin-status-badge--neutral">جلسة محمية</span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
