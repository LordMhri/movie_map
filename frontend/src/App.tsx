import { useEffect, useRef, useState } from 'react'
import './App.css'

type Movie = {
  id: number
  title: string
  year: number | null
  genres: string[]
  ratingCount: number
  x: number
  y: number
  source: string
}

type SimilarResult = {
  movie: Movie
  score: number
  contentScore: number
  cfScore: number
}

type SimilarResponse = {
  query: Movie
  results: SimilarResult[]
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

function App() {
  const [movies, setMovies] = useState<Movie[]>([])
  const [selected, setSelected] = useState<Movie | null>(null)
  const [similar, setSimilar] = useState<SimilarResult[]>([])
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Movie[]>([])
  const [cfWeight, setCfWeight] = useState(0.7)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/map`)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load the movie map')
        return response.json() as Promise<Movie[]>
      })
      .then((loadedMovies) => {
        setMovies(loadedMovies)
        if (loadedMovies.length > 0) setSelected(loadedMovies[0])
      })
      .catch((reason: Error) => setError(reason.message))
  }, [])

  useEffect(() => {
    if (!selected) return
    fetch(`${API_URL}/movies/${selected.id}/similar?k=12&w=${cfWeight}`)
      .then((response) => {
        if (!response.ok) throw new Error('Could not calculate similar movies')
        return response.json() as Promise<SimilarResponse>
      })
      .then((payload) => {
        setSimilar(payload.results)
        setError('')
      })
      .catch((reason: Error) => setError(reason.message))
  }, [selected, cfWeight])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      return
    }
    const timeout = window.setTimeout(() => {
      fetch(`${API_URL}/movies/search?q=${encodeURIComponent(trimmed)}`)
        .then((response) => response.json() as Promise<Movie[]>)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
    }, 180)
    return () => window.clearTimeout(timeout)
  }, [query])

  function chooseMovie(movie: Movie) {
    setSelected(movie)
    setQuery(movie.title)
    setSuggestions([])
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">MovieLens 1M · hybrid similarity</p>
          <h1>Movie Map</h1>
          <p className="subtitle">Explore what audiences liked together—and what feels alike.</p>
        </div>
        <div className="search">
          <label htmlFor="movie-search">Find a movie</label>
          <input
            id="movie-search"
            placeholder="Try The Matrix…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
          {suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map((movie) => (
                <li key={movie.id}>
                  <button onClick={() => chooseMovie(movie)}>
                    <span>{movie.title}</span>
                    <small>{movie.year ?? 'Unknown year'}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {error && <p className="error">{error}. Is the Go API running?</p>}

      <section className="control-bar">
        <div>
          <span className="control-title">Similarity blend</span>
          <span className="control-note">Move from story and genre toward audience taste.</span>
        </div>
        <div className="slider">
          <span>Content</span>
          <input
            aria-label="Collaborative filtering weight"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={cfWeight}
            onChange={(event) => setCfWeight(Number(event.target.value))}
          />
          <span>Audience</span>
          <output>{Math.round(cfWeight * 100)}%</output>
        </div>
      </section>

      <section className="workspace">
        <article className="panel map-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">The landscape</p>
              <h2>Similarity map</h2>
            </div>
            <span>{movies.length.toLocaleString()} films</span>
          </div>
          <MovieMap
            movies={movies}
            selected={selected}
            neighborIds={new Set(similar.map((result) => result.movie.id))}
            onSelect={chooseMovie}
          />
        </article>

        <aside className="right-column">
          <article className="panel focus-panel">
            <p className="eyebrow">Now exploring</p>
            <h2>{selected?.title ?? 'Choose a film'}</h2>
            <p className="metadata">
              {[selected?.year, ...(selected?.genres ?? []).slice(0, 2)]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <NeighborGraph query={selected} results={similar.slice(0, 8)} onSelect={chooseMovie} />
          </article>

          <article className="panel result-panel">
            <div className="panel-heading">
              <h2>Closest films</h2>
              <span>score</span>
            </div>
            <ol>
              {similar.map((result) => (
                <li key={result.movie.id}>
                  <button onClick={() => chooseMovie(result.movie)}>
                    <span>
                      <strong>{result.movie.title}</strong>
                      <small>{result.movie.year}</small>
                    </span>
                    <b>{Math.round(result.score * 100)}</b>
                  </button>
                </li>
              ))}
            </ol>
          </article>
        </aside>
      </section>
    </main>
  )
}

function MovieMap({
  movies,
  selected,
  neighborIds,
  onSelect,
}: {
  movies: Movie[]
  selected: Movie | null
  neighborIds: Set<number>
  onSelect: (movie: Movie) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointsRef = useRef<{ movie: Movie; x: number; y: number }[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || movies.length === 0) return
    const context = canvas.getContext('2d')
    if (!context) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const ratio = window.devicePixelRatio || 1
    canvas.width = width * ratio
    canvas.height = height * ratio
    context.scale(ratio, ratio)
    context.clearRect(0, 0, width, height)

    const xs = movies.map((movie) => movie.x)
    const ys = movies.map((movie) => movie.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const padding = 22
    const scaleX = (value: number) => padding + ((value - minX) / (maxX - minX || 1)) * (width - padding * 2)
    const scaleY = (value: number) => padding + ((value - minY) / (maxY - minY || 1)) * (height - padding * 2)

    pointsRef.current = movies.map((movie) => ({ movie, x: scaleX(movie.x), y: scaleY(movie.y) }))
    for (const point of pointsRef.current) {
      const isSelected = point.movie.id === selected?.id
      const isNeighbor = neighborIds.has(point.movie.id)
      context.beginPath()
      context.fillStyle = isSelected ? '#ff6b35' : isNeighbor ? '#f5b942' : 'rgba(157, 190, 174, .38)'
      context.arc(point.x, point.y, isSelected ? 6 : isNeighbor ? 3.5 : 1.7, 0, Math.PI * 2)
      context.fill()
    }
  }, [movies, selected, neighborIds])

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    const closest = pointsRef.current.reduce<{ movie: Movie; distance: number } | null>((best, point) => {
      const distance = Math.hypot(point.x - x, point.y - y)
      return !best || distance < best.distance ? { movie: point.movie, distance } : best
    }, null)
    if (closest && closest.distance < 12) onSelect(closest.movie)
  }

  return <canvas ref={canvasRef} onClick={handleClick} aria-label="Interactive movie similarity map" />
}

function NeighborGraph({
  query,
  results,
  onSelect,
}: {
  query: Movie | null
  results: SimilarResult[]
  onSelect: (movie: Movie) => void
}) {
  if (!query) return <div className="graph empty">Search for a movie to begin.</div>
  const center = { x: 180, y: 132 }
  const nodes = results.map((result, index) => {
    const angle = (index / Math.max(results.length, 1)) * Math.PI * 2 - Math.PI / 2
    return { ...result, x: center.x + Math.cos(angle) * 102, y: center.y + Math.sin(angle) * 88 }
  })

  return (
    <svg className="graph" viewBox="0 0 360 264" role="img" aria-label={`Movies similar to ${query.title}`}>
      {nodes.map((node) => (
        <line key={`line-${node.movie.id}`} x1={center.x} y1={center.y} x2={node.x} y2={node.y} />
      ))}
      <circle className="query-node" cx={center.x} cy={center.y} r="22" />
      <text className="query-label" x={center.x} y={center.y + 35}>{shortTitle(query.title)}</text>
      {nodes.map((node) => (
        <g key={node.movie.id} onClick={() => onSelect(node.movie)} className="neighbor-node">
          <circle cx={node.x} cy={node.y} r={7 + node.score * 5} />
          <text x={node.x} y={node.y + 20}>{shortTitle(node.movie.title)}</text>
        </g>
      ))}
    </svg>
  )
}

function shortTitle(title: string) {
  return title.length > 16 ? `${title.slice(0, 14)}…` : title
}

export default App
