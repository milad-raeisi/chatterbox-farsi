.PHONY: setup models web start stop dev dev-api dev-web test

# One-time setup (needs internet).
setup:
	cd backend && uv sync
	cd web && npm install && npm run build

models:
	cd backend && uv run python scripts/download_models.py

web:
	cd web && npm run build

# Fully offline from here on.
start:
	./start.sh

stop:
	./stop.sh

dev:
	$(MAKE) -j2 dev-api dev-web

dev-api:
	cd backend && uv run python -m app --reload

dev-web:
	cd web && npm run dev

test:
	cd backend && uv run --group dev pytest -q
	cd web && npm run lint && npm run typecheck
