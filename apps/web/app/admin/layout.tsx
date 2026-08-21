import Link from 'next/link';
import { translate, type TranslationKey } from '@sallah/i18n';
import { requireAdmin, type AdminPermission } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const t = (key: TranslationKey) => translate('ar', key);
const links: ReadonlyArray<readonly [string, string, readonly AdminPermission[]]> = [
  ['/admin', 'الرئيسية', ['dashboard.aggregate.read']],
  ['/admin/customers', 'العملاء', ['customer.pii.read']],
  ['/admin/providers', 'التحقق', ['provider.document.read']],
  ['/admin/catalog', 'الكتالوج', ['operations.mutate']],
  ['/admin/requests', 'الطلبات', ['operations.marketplace.read']],
  ['/admin/jobs', 'الأعمال', ['operations.marketplace.read']],
  ['/admin/support', 'الدعم', ['support.case.read', 'operations.marketplace.read']],
  [
    '/admin/moderation',
    t('adminModerationNavigation'),
    ['support.case.read', 'operations.marketplace.read'],
  ],
  ['/admin/finance', 'المالية', ['finance.read']],
  ['/admin/audit', 'التدقيق', ['operations.mutate']],
] as const;
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles, permissions } = await requireAdmin(['dashboard.aggregate.read']);
  return (
    <div className="admin-shell">
      <header className="admin-top">
        <div className="shell">
          <div className="nav">
            <Link className="brand" style={{ color: 'white' }} href="/admin">
              SALLAH OPS
            </Link>
            <span>{roles.join(' · ')}</span>
          </div>
          <nav className="admin-nav" aria-label="عمليات المنصة">
            {links
              .filter(([, , required]) =>
                required.some((permission) => permissions.has(permission)),
              )
              .map(([href, label]) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
