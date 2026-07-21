package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"

	"moviemap/backend/internal/api"
	"moviemap/backend/internal/artifacts"
)

func main() {
	dataDirectory := flag.String("data", "../data", "artifact directory")
	address := flag.String("addr", ":8080", "HTTP listen address")
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
	if err := http.ListenAndServe(*address, api.New(store)); err != nil {
		log.Fatal(err)
	}
}
