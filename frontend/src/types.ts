export type Movie = {
  id: number
  title: string
  year: number | null
  genres: string[]
  ratingCount: number
  x: number
  y: number
  source: string
  broadClusterId: number
  childClusterId: number
}

export type Cluster = {
  id: number
  parentId: number | null
  level: number
  label: string
  x: number
  y: number
  radius: number
  movieCount: number
}

export type MapEdge = {
  source: number
  target: number
  score: number
}

export type MapPayload = {
  movies: Movie[]
  clusters: Cluster[]
  edges: MapEdge[]
}

export type SimilarResult = {
  movie: Movie
  score: number
  contentScore: number
  cfScore: number
}

export type SimilarResponse = {
  query: Movie
  results: SimilarResult[]
}
