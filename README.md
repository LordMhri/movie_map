# Movie Map

Movie Map is an interactive atlas of ~45K films. Pick a movie and it ranks
near-neighbors by a blend of **what the film is about** and **who tends to like
the same films**. The same space is projected onto a zoomable 2D map so related
titles form regions you can explore.

## What it does

- Search the catalog and inspect a film’s metadata
- Rank similar movies with a live **Story ↔ Taste** blend slider
- Browse a global similarity map with zoom, pan, genre/year filters, and
  constellation mode for a selected neighborhood
- Break each recommendation into content vs collaborative scores

The frontend is a React map client. The Go API loads precomputed artifacts and
answers search / similar / map queries. Heavy model work runs offline in
Python and is exported once.

## Data

Catalog and plot/cast metadata come from Kaggle’s
[The Movies Dataset](https://www.kaggle.com/datasets/rounakbanik/the-movies-dataset)
(TMDB-linked). Ratings for collaborative filtering come from the same archive’s
ratings dump (~26M rows). Sparse titles (under 20 ratings) get no collaborative
signal and fall back to content only.

## Similarity model

Every movie gets two vectors. At query time the API blends them with weight
`w` (the Taste slider; `1 − w` is Story):

```text
score(a, b) = hybrid_cosine(
  content_a, content_b,
  cf_a, cf_b,
  w
)
```

### Content embeddings (Story)

Each film is turned into a short text blob:

`title · year · genres · plot · keywords · cast · directors`

That text is embedded with
[`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
via [fastembed](https://github.com/qdrant/fastembed) into **384-D** unit
vectors. Cosine similarity here means “these films talk about similar themes,
tones, and people.”

### Collaborative filtering (Taste)

User–movie ratings are stored as a sparse matrix (ratings centered around 3.0).
[Truncated SVD](https://scikit-learn.org/stable/modules/generated/sklearn.decomposition.TruncatedSVD.html)
factorizes it into **64-D** movie latent vectors. Vectors are L2-normalized,
then shrunk by rating confidence:

```text
confidence = n / (n + 25)
confidence = 0  if n < 20
```

so lightly rated films contribute little CF signal. Cosine (via the dot product
of these scaled vectors) means “people who liked one also liked the other,”
independent of shared plot keywords.

### Hybrid ranking

The Go search engine compares every candidate in parallel (chunked across
goroutines) and sorts by hybrid score. Content and CF cosines are also returned
separately so the UI can show the Story / Taste breakdown. Changing `w`
re-ranks without rebuilding the model.

## The map

The map is a layout of the catalog, not the ranking engine:

1. **UMAP** projects the **content** vectors to 2D (`n_neighbors=30`,
   `min_dist=0.12`, cosine metric). Using content-only coordinates keeps the
   landscape about semantic neighborhood rather than rating coverage.
2. **K-means** builds a two-level hierarchy on those vectors (~12 broad
   regions, then niche children), labeled by dominant genres/decades.
3. Local map edges are nearest neighbors **within** each child cluster
   (cosine over content space), drawn as you zoom in.

Recommendations still use the hybrid score above; the map is the spatial
overview of story-space.

## Stack

| Layer | Role |
| --- | --- |
| `ml/` | Offline ingest, embeddings, SVD, UMAP, clusters, artifact export |
| `data/` | `movies.db` + `vectors.f32` + `manifest.json` |
| `backend/` | Go JSON API: load artifacts, hybrid cosine top-K |
| `frontend/` | React atlas: map, inspector, filters, constellation, theme |

Artifacts are versioned as manifest v2: 45,433 movies, 384-D content + 64-D CF
vectors packed as float32.
