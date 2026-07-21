package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"moviemap/backend/internal/api"
	"moviemap/backend/internal/artifacts"
)

func main() {
	defaultAddress := ":8080"
	if port := os.Getenv("PORT"); port != "" {
		defaultAddress = ":" + port
	}

	dataDirectory := flag.String("data", "../data", "artifact directory")
	address := flag.String("addr", defaultAddress, "HTTP listen address")
	flag.Parse()

	store, err := artifacts.Load(*dataDirectory)
	if err != nil {
		log.Fatalf("load artifacts: %v", err)
	}

	fmt.Printf(
		"Movie Map API listening on %s with %d movies\n",
		*address,
		len(store.Movies),
	)
	allowedOrigin := os.Getenv("ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:5173"
	}
	if err := http.ListenAndServe(
		*address,
		api.NewWithAllowedOrigin(store, allowedOrigin),
	); err != nil {
		log.Fatal(err)
	}
}
