export default function ActivityLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Cargando actividad">
      <div className="space-y-2">
        <div className="h-7 w-64 animate-pulse rounded-md bg-surface-pressed" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-surface-pressed" />
      </div>
      <div className="h-56 animate-pulse rounded-md border border-surface-border bg-surface-raised" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-16 animate-pulse rounded-md border border-surface-border bg-surface-raised"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-md border border-surface-border bg-surface-raised" />
    </div>
  );
}
