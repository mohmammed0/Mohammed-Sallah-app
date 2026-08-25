import { translate } from '@sallah/i18n';

export function GlobalErrorView({ onReset }: { onReset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <main
          aria-live="assertive"
          role="alert"
          style={{
            display: 'grid',
            minHeight: '100vh',
            placeContent: 'center',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'right',
          }}
        >
          <h1>{translate('ar', 'startupErrorTitle')}</h1>
          <p>{translate('ar', 'startupErrorMessage')}</p>
          <button onClick={onReset} type="button">
            {translate('ar', 'retry')}
          </button>
        </main>
      </body>
    </html>
  );
}
