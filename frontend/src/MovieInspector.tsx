import type { Movie, SimilarResult } from './types'

export function MovieInspector({
  selected,
  results,
  cfWeight,
  onSelect,
}: {
  selected: Movie | null
  results: SimilarResult[]
  cfWeight: number
  onSelect: (movie: Movie) => void
}) {
  return (
    <aside className="inspector">
      <div className="inspector-header">
        <p className="eyebrow">Now exploring</p>
        <h2>{selected?.title ?? 'Choose a film'}</h2>
        {selected && (
          <>
            <p className="metadata">
              {[selected.year, ...selected.genres].filter(Boolean).join(' · ')}
            </p>
            <div className="movie-facts">
              <span>
                <small>Ratings</small>
                <strong>{selected.ratingCount.toLocaleString()}</strong>
              </span>
              <span>
                <small>Model</small>
                <strong>{Math.round((1 - cfWeight) * 100)} / {Math.round(cfWeight * 100)}</strong>
              </span>
              <span>
                <small>Region</small>
                <strong>#{selected.broadClusterId}</strong>
              </span>
            </div>
          </>
        )}
      </div>

      <div className="recommendation-heading">
        <div>
          <p className="eyebrow">Nearest neighbors</p>
          <h3>Closest films</h3>
        </div>
        <span>{results.length || '—'}</span>
      </div>

      {!selected ? (
        <div className="inspector-empty">Search or select a point on the map to begin.</div>
      ) : results.length === 0 ? (
        <div className="inspector-empty">
          <span className="loading-dot" />
          Calculating its neighborhood…
        </div>
      ) : (
        <ol className="recommendations">
          {results.map((result, index) => (
            <li key={result.movie.id}>
              <button type="button" onClick={() => onSelect(result.movie)}>
                <span className="result-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="result-copy">
                  <strong>{result.movie.title}</strong>
                  <small>
                    {result.movie.year ?? 'Unknown year'} · {result.movie.genres.slice(0, 2).join(', ')}
                  </small>
                  <span className="score-breakdown">
                    <i style={{ width: `${Math.max(0, result.contentScore) * 100}%` }} />
                    <i style={{ width: `${Math.max(0, result.cfScore) * 100}%` }} />
                  </span>
                  <span className="score-labels">
                    <small>story {Math.round(result.contentScore * 100)}</small>
                    <small>taste {Math.round(result.cfScore * 100)}</small>
                  </span>
                </span>
                <b>{Math.round(result.score * 100)}</b>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
