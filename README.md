# Movie Map

Movie Map ranks and visualizes similar films using a hybrid of semantic content
embeddings and MovieLens collaborative-filtering vectors.

The implementation follows [plans.md](plans.md). The current target is v1,
Phase 1: MovieLens 1M end to end.

## Architecture

- `ml/`: offline Python artifact pipeline
- `backend/`: Go JSON API and concurrent cosine search
- `frontend/`: React map, neighbor graph, and similarity controls
- `data/`: generated SQLite, vector, and manifest artifacts

## Build the artifacts

Python 3.11–3.13 is recommended because ML package support can lag behind the
latest Python release.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt
python ml/pipeline.py
```

The first run downloads the configured sentence-transformer model. It writes:

- `data/movies.db`
- `data/vectors.f32`
- `data/manifest.json`

## Run the API

```bash
cd backend
go run ./cmd/server -data ../data
```

The service listens on `http://localhost:8080`.

## Run the web app

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Checks

```bash
cd ml && python -m unittest -v
cd backend && go test ./...
cd frontend && npm run build && npm run lint
```
