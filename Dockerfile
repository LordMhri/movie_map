FROM golang:1.26.4-alpine AS builder

WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /movie-map \
    ./cmd/server

FROM scratch

WORKDIR /app
COPY --from=builder /movie-map /app/movie-map
COPY data/ /app/data/

USER 65532:65532
EXPOSE 8080

ENTRYPOINT ["/app/movie-map", "-data", "/app/data"]
