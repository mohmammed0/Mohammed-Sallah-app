import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const links = [
  ['/admin', 'الرئيسية'],
  ['/admin/customers', 'العملاء'],
  ['/admin/providers', 'التحقق'],
  ['/admin/catalog', 'الكتالوج'],
  ['/admin/requests', 'الطلبات'],
  ['/admin/jobs', 'الأعمال'],
  ['/admin/support', 'الدعم'],
  ['/admin/finance', 'المالية'],
  ['/admin/audit', 'التدقيق'],
] as const;
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles } = await requireAdmin();
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
            {links.map(([href, label]) => (
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
