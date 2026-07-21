# Movie Map

Movie Map ranks and visualizes similar films using a hybrid of semantic content
embeddings and MovieLens collaborative-filtering vectors.

The implementation follows [plans.md](plans.md). v1 Phase 1 is complete,
including the zoomable hierarchical-map extension.

## Architecture

- `ml/`: offline Python artifact pipeline
- `backend/`: Go JSON API and concurrent cosine search
- `frontend/`: React map, neighbor graph, and similarity controls
- `data/`: generated SQLite, vector, and manifest artifacts

## Build the artifacts

Python 3.13 is recommended because ML package support can lag behind the latest
Python release. With `uv` installed:

```bash
uv venv --python 3.13 .venv
source .venv/bin/activate
uv pip install -r ml/requirements.txt
python ml/pipeline.py
```

The first run downloads the configured sentence-transformer model. It writes:

- `data/movies.db`
- `data/vectors.f32`
- `data/manifest.json`

## Run the API

```bash
cd backend
go run ./cmd/server -data ../data -addr :8083
```

The service listens on `http://localhost:8083`.

## Run the web app

In a second terminal:

```bash
cd frontend
npm install
VITE_API_URL=http://localhost:8083 npm run dev
```

Open `http://localhost:5173`.

On the map, use the wheel or trackpad to zoom, drag to pan, double-click to
zoom toward a region, or use the on-map controls. Broad genre regions split
into niche labels and local similarity connections as you zoom in.

## Checks

```bash
cd ml && python -m unittest -v
cd backend && go test ./...
cd frontend && npm run build && npm run lint
```
