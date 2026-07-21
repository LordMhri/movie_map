import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { MapFilters } from './MapFilters'
import { MapSkeleton } from './MapSkeleton'
import { MovieMap } from './MovieMap'
import { MovieInspector } from './MovieInspector'
import { TopBar } from './TopBar'
import type { Cluster, MapEdge, MapPayload, Movie, SimilarResponse, SimilarResult } from './types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

function App() {
  const [movies, setMovies] = useState<Movie[]>([])
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [mapEdges, setMapEdges] = useState<MapEdge[]>([])
  const [selected, setSelected] = useState<Movie | null>(null)
  const [similar, setSimilar] = useState<SimilarResult[]>([])
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Movie[]>([])
  const [cfWeight, setCfWeight] = useState(0.7)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [genre, setGenre] = useState('')
  const [yearStart, setYearStart] = useState(1870)
  const [yearEnd, setYearEnd] = useState(new Date().getFullYear())

  useEffect(() => {
    fetch(`${API_URL}/map`)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load the movie map')
        return response.json() as Promise<MapPayload>
      })
      .then((payload) => {
        setMovies(payload.movies)
        setClusters(payload.clusters)
        setMapEdges(payload.edges)
        if (payload.movies.length > 0) setSelected(payload.movies[0])
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
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
    setSimilar([])
    setQuery(movie.title)
    setSuggestions([])
  }

  const genres = useMemo(
    () => [...new Set(movies.flatMap((movie) => movie.genres))].sort(),
    [movies],
  )
  const yearBounds = useMemo(() => {
    const years = movies.flatMap((movie) => (movie.year ? [movie.year] : []))
    return {
      minimum: years.length ? Math.min(...years) : 1870,
      maximum: years.length ? Math.max(...years) : new Date().getFullYear(),
    }
  }, [movies])
  useEffect(() => {
    setYearStart(yearBounds.minimum)
    setYearEnd(yearBounds.maximum)
  }, [yearBounds])

  const visibleMovieIds = useMemo(() => {
    const ids = new Set<number>()
    for (const movie of movies) {
      const genreMatches = !genre || movie.genres.includes(genre)
      const yearMatches =
        movie.year === null || (movie.year >= yearStart && movie.year <= yearEnd)
      if (genreMatches && yearMatches) ids.add(movie.id)
    }
    return ids
  }, [movies, genre, yearStart, yearEnd])

  const filtersActive =
    genre !== '' || yearStart !== yearBounds.minimum || yearEnd !== yearBounds.maximum

  function resetFilters() {
    setGenre('')
    setYearStart(yearBounds.minimum)
    setYearEnd(yearBounds.maximum)
  }

  return (
    <main className="app-shell">
      <TopBar
        query={query}
        suggestions={suggestions}
        cfWeight={cfWeight}
        onQueryChange={setQuery}
        onChoose={chooseMovie}
        onWeightChange={setCfWeight}
      />

      <section className="workspace">
        <article className="map-panel">
          <div className="map-heading">
            <div>
              <p className="eyebrow">The landscape</p>
              <h1>Movie Map</h1>
            </div>
            <span>
              {visibleMovieIds.size.toLocaleString()} / {movies.length.toLocaleString()} films
            </span>
          </div>

          <div className="map-stage">
            {loading ? (
              <MapSkeleton />
            ) : error ? (
              <div className="map-state error-state">
                <strong>The map could not be loaded</strong>
                <span>{error}. Is the Go API running?</span>
              </div>
            ) : visibleMovieIds.size === 0 ? (
              <div className="map-state">
                <strong>No films match these filters</strong>
                <button type="button" onClick={resetFilters}>Reset filters</button>
              </div>
            ) : (
              <MovieMap
                movies={movies}
                clusters={clusters}
                edges={mapEdges}
                selected={selected}
                selectedEdges={similar}
                visibleMovieIds={visibleMovieIds}
                onSelect={chooseMovie}
              />
            )}
            {!loading && !error && (
              <MapFilters
                genres={genres}
                genre={genre}
                yearStart={yearStart}
                yearEnd={yearEnd}
                minimumYear={yearBounds.minimum}
                maximumYear={yearBounds.maximum}
                active={filtersActive}
                onGenreChange={setGenre}
                onYearStartChange={setYearStart}
                onYearEndChange={setYearEnd}
                onReset={resetFilters}
              />
            )}
          </div>
        </article>

        <MovieInspector
          selected={selected}
          results={similar}
          cfWeight={cfWeight}
          onSelect={chooseMovie}
        />
      </section>
    </main>
  )
}

export default App
