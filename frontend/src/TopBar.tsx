import type { Movie } from './types'

export function TopBar({
  query,
  suggestions,
  cfWeight,
  onQueryChange,
  onChoose,
  onWeightChange,
  darkMode,
  onThemeToggle,
}: {
  query: string
  suggestions: Movie[]
  cfWeight: number
  onQueryChange: (query: string) => void
  onChoose: (movie: Movie) => void
  onWeightChange: (weight: number) => void
  darkMode: boolean
  onThemeToggle: () => void
}) {
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div>
          <strong>Movie Map</strong>
          <small>45K-film similarity atlas</small>
        </div>
      </div>

      <div className="search">
        <label className="sr-only" htmlFor="movie-search">Find a movie</label>
        <span className="search-icon" aria-hidden="true">⌕</span>
        <input
          id="movie-search"
          placeholder="Find a movie…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <ul className="suggestions">
            {suggestions.map((movie) => (
              <li key={movie.id}>
                <button type="button" onClick={() => onChoose(movie)}>
                  <span>{movie.title}</span>
                  <small>{movie.year ?? 'Unknown year'}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="blend-control">
        <div>
          <span>Similarity blend</span>
          <strong>{Math.round(cfWeight * 100)}% audience</strong>
        </div>
        <label>
          <span>Story</span>
          <input
            aria-label="Collaborative filtering weight"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={cfWeight}
            onChange={(event) => onWeightChange(Number(event.target.value))}
          />
          <span>Taste</span>
        </label>
        <button
          type="button"
          className="theme-toggle"
          onClick={onThemeToggle}
          aria-label={`Use ${darkMode ? 'light' : 'dark'} theme`}
          title={`Use ${darkMode ? 'light' : 'dark'} theme`}
        >
          {darkMode ? '☀' : '☾'}
        </button>
      </div>
    </header>
  )
}
