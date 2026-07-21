export function MapFilters({
  genres,
  genre,
  yearStart,
  yearEnd,
  minimumYear,
  maximumYear,
  active,
  onGenreChange,
  onYearStartChange,
  onYearEndChange,
  onReset,
}: {
  genres: string[]
  genre: string
  yearStart: number
  yearEnd: number
  minimumYear: number
  maximumYear: number
  active: boolean
  onGenreChange: (genre: string) => void
  onYearStartChange: (year: number) => void
  onYearEndChange: (year: number) => void
  onReset: () => void
}) {
  return (
    <div className="map-filters" aria-label="Map filters">
      <label>
        <span>Genre</span>
        <select value={genre} onChange={(event) => onGenreChange(event.target.value)}>
          <option value="">All genres</option>
          {genres.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <div className="year-filter">
        <span>Year</span>
        <label>
          <span className="sr-only">Earliest release year</span>
          <input
            type="number"
            min={minimumYear}
            max={yearEnd}
            value={yearStart}
            onChange={(event) => onYearStartChange(Number(event.target.value))}
          />
        </label>
        <i>—</i>
        <label>
          <span className="sr-only">Latest release year</span>
          <input
            type="number"
            min={yearStart}
            max={maximumYear}
            value={yearEnd}
            onChange={(event) => onYearEndChange(Number(event.target.value))}
          />
        </label>
      </div>
      {active && <button type="button" onClick={onReset}>Reset</button>}
    </div>
  )
}
