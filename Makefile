.PHONY: help install build dev test format lint clean all

# Gramark project task manager
# Provides a unified interface for building, testing, and developing across:
# - Core PureScript compiler (via Spago)
# - Documentation site (via Astro/npm in site/)
# - Bootstrap bridge (via npm in bootstrap/)

help:
	@echo "Gramark - Make targets"
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make install       Install all dependencies (Spago, site npm, bootstrap npm)"
	@echo ""
	@echo "Development:"
	@echo "  make dev           Start the local Astro docs site (site/npm run dev)"
	@echo "  make dev-build     Build everything in watch/dev mode"
	@echo ""
	@echo "Building:"
	@echo "  make build         Build all components (Spago, site, bootstrap)"
	@echo "  make build-core    Build PureScript compiler (spago build)"
	@echo "  make build-site    Build Astro docs site (site/npm run build)"
	@echo "  make build-boot    Typecheck bootstrap bridge (bootstrap/npm run typecheck)"
	@echo ""
	@echo "Testing:"
	@echo "  make test          Run all tests (core, site, bootstrap)"
	@echo "  make test-core     Run PureScript tests (bootstrap check)"
	@echo "  make test-site     Run site tests (tsx test harness)"
	@echo "  make test-boot     Run bootstrap tests (Node --test)"
	@echo ""
	@echo "Code Quality:"
	@echo "  make format        Format all code (site, bootstrap)"
	@echo "  make lint          Lint all code (site prettier, bootstrap lint)"
	@echo "  make lint-site     Lint site code"
	@echo "  make lint-boot     Lint bootstrap code"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean         Remove all build artifacts and caches"
	@echo "  make clean-core    Clean Spago output and cache"
	@echo "  make clean-site    Clean Astro build output and cache"
	@echo "  make clean-boot    Clean bootstrap dependencies"
	@echo ""
	@echo "Combined:"
	@echo "  make all           Install + build + test (full development flow)"
	@echo "  make verify        Build + test (CI-like verification)"

# Setup & Installation
install:
	@echo "Installing project dependencies..."
	@spago install
	@cd site && npm install
	@cd bootstrap && npm install
	@echo "Installation complete"

# Development
dev:
	@cd site && npm run dev

dev-build:
	@echo "Building and watching all components..."
	@spago build

# Building
build: build-core build-site build-boot
	@echo "All build targets complete"

build-core:
	@echo "Building PureScript compiler..."
	@spago build

build-site:
	@echo "Building Astro docs site..."
	@cd site && npm run build

build-boot:
	@echo "Typechecking bootstrap bridge..."
	@cd bootstrap && npm run typecheck

# Testing
test: test-core test-site test-boot
	@echo "All tests passed"

test-core:
	@echo "Testing PureScript grammar (bootstrap check)..."
	@cd bootstrap && npm run check

test-site:
	@echo "Testing site utilities..."
	@cd site && npm run test

test-boot:
	@echo "Testing bootstrap bridge..."
	@cd bootstrap && npm run test

# Code Quality
format:
	@echo "Formatting site code..."
	@cd site && npm run format
	@echo "Formatting bootstrap code..."
	@cd bootstrap && npm run format
	@echo "Formatting complete"

lint: lint-site lint-boot
	@echo "All linting checks passed"

lint-site:
	@echo "Linting site code..."
	@cd site && npm run lint

lint-boot:
	@echo "Linting bootstrap code..."
	@cd bootstrap && npm run lint:md && npm run format:check

# Cleanup
clean: clean-core clean-site clean-boot
	@echo "Cleanup complete"

clean-core:
	@echo "Cleaning Spago output..."
	@rm -rf output .spago .spago-lock.json

clean-site:
	@echo "Cleaning Astro build..."
	@rm -rf site/dist site/.astro site/.cache site/.vite

clean-boot:
	@echo "Cleaning bootstrap..."
	@rm -rf bootstrap/node_modules bootstrap/.turbo

# Combined workflows
all: install build test
	@echo "Full development setup complete"

verify: clean build test lint
	@echo "Full verification passed"
