type LoadingSkeletonProps = { variant?: 'site' | 'dashboard' | 'admin' };

function Block({ className = '' }: { className?: string }) {
  return <span className={`skeleton-block ${className}`} aria-hidden="true" />;
}

export function LoadingSkeleton({ variant = 'site' }: LoadingSkeletonProps) {
  if (variant === 'site') {
    return (
      <main className="container loading-site" role="status" aria-label="Carregando página">
        <div className="loading-nav"><Block className="skeleton-brand" /><Block className="skeleton-navlinks" /></div>
        <div className="loading-hero">
          <div className="loading-copy"><Block className="skeleton-eyebrow" /><Block className="skeleton-title" /><Block className="skeleton-title-short" /><Block className="skeleton-copy" /><Block className="skeleton-button" /></div>
          <Block className="skeleton-hero-image" />
        </div>
        <div className="loading-section-heading"><Block className="skeleton-eyebrow" /><Block className="skeleton-heading" /></div>
        <div className="loading-course-grid">
          {[0, 1, 2].map((item) => <div className="skeleton-course" key={item}><Block className="skeleton-course-image" /><Block className="skeleton-eyebrow" /><Block className="skeleton-course-title" /><Block className="skeleton-copy" /></div>)}
        </div>
        <span className="sr-only">Carregando conteúdo…</span>
      </main>
    );
  }

  return (
    <div className="loading-workspace" role="status" aria-label="Carregando área de trabalho">
      <Block className="skeleton-eyebrow" />
      <Block className="skeleton-heading" />
      <Block className="skeleton-copy skeleton-copy-wide" />
      {variant === 'dashboard' && <div className="loading-stats">{[0, 1].map((item) => <div className="skeleton-stat" key={item}><Block className="skeleton-eyebrow" /><Block className="skeleton-heading" /><Block className="skeleton-copy" /></div>)}</div>}
      <div className="loading-list">{[0, 1, 2].map((item) => <div className="skeleton-row" key={item}><Block className="skeleton-row-main" /><Block className="skeleton-row-meta" /></div>)}</div>
      <span className="sr-only">Carregando conteúdo…</span>
    </div>
  );
}