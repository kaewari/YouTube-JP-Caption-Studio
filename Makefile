.PHONY: dev build-ext clean

dev:
	@echo "Starting local-bridge..."
	@cd local-bridge && ./start.sh

build-ext:
	@echo "Building extension UI..."
	@cd web/saved-items && npm run build:extension

clean:
	@echo "Cleaning runtime data..."
	@rm -rf data/subtitles/*
