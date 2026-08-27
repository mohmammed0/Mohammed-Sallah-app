export default function AdminLoading() {
  return (
    <main className="admin-dashboard" aria-busy="true" aria-live="polite">
      <section className="admin-dashboard-heading">
        <div>
          <p className="admin-kicker">يجري التحميل</p>
          <h1>لوحة العمليات</h1>
          <p>يتم تحميل المؤشرات المتاحة لهذه الجلسة.</p>
        </div>
      </section>
      <section className="admin-metric-grid" aria-label="تحميل مؤشرات العمليات">
        {Array.from({ length: 9 }, (_, index) => (
          <div className="admin-metric-card admin-metric-card--loading" key={index}>
            <span className="admin-skeleton admin-skeleton--line" />
            <span className="admin-skeleton admin-skeleton--metric" />
          </div>
        ))}
      </section>
    </main>
  );
}
