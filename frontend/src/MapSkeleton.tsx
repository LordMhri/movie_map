export function MapSkeleton() {
  return (
    <div className="map-skeleton" role="status" aria-label="Loading the movie map">
      <div className="skeleton-orbit orbit-one" />
      <div className="skeleton-orbit orbit-two" />
      <div className="skeleton-orbit orbit-three" />
      {Array.from({ length: 24 }, (_, index) => (
        <i
          key={index}
          style={{
            left: `${8 + ((index * 37) % 84)}%`,
            top: `${9 + ((index * 53) % 80)}%`,
            animationDelay: `${(index % 8) * 80}ms`,
          }}
        />
      ))}
      <p>
        <strong>Charting 45,433 films</strong>
        <span>Loading regions, relationships, and audience taste…</span>
      </p>
    </div>
  )
}
