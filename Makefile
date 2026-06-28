IMAGE_NAME := drone-weather

.PHONY: dev build test clean

dev: ## Start Vite dev server (hot reload, port 5173)
	docker run --rm -it -v "$(PWD)":/app -w /app -p 5173:5173 node:22-alpine sh -c "npm install && npm run dev -- --host"

test: ## Run unit tests in Docker
	docker build --target test -t $(IMAGE_NAME)-test .

build: ## Build production dist/ via Docker
	rm -rf dist
	docker build --target build -t $(IMAGE_NAME)-build .
	docker create --name $(IMAGE_NAME)-tmp $(IMAGE_NAME)-build
	docker cp $(IMAGE_NAME)-tmp:/app/dist ./dist
	docker rm $(IMAGE_NAME)-tmp

clean: ## Remove dist/ and Docker artifacts
	rm -rf dist node_modules
	-docker rmi $(IMAGE_NAME)-test $(IMAGE_NAME)-build 2>/dev/null
