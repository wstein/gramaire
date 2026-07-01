.PHONY: help install build dev test format lint clean all

# Gramark project task manager
# Provides a unified interface for building, testing, and developing across:
# - Core Scala compiler + CLI (via sbt, cross-built to JVM and Scala.js)
# - Documentation site (via Astro/npm in site/)
# - Markdown lint (via npm in docs-lint/)

help:
	@echo "Gramark - Make targets"
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make install       Install all dependencies (site npm, docs-lint npm)"
	@echo ""
	@echo "Development:"
	@echo "  make dev           Start the local Astro docs site (site/npm run dev)"
	@echo ""
	@echo "Building:"
	@echo "  make build         Build all components (core, cli, site)"
	@echo "  make build-core    Cross-compile the Scala core + CLI (sbt compile)"
	@echo "  make build-site    Build Astro docs site (site/npm run build)"
	@echo ""
	@echo "Testing:"
	@echo "  make test          Run all tests (core, cli, site-glue, site)"
	@echo "  make test-core     Run the Scala test suite (sbt test)"
	@echo "  make test-site     Run site tests (tsx test harness)"
	@echo ""
	@echo "Code Quality:"
	@echo "  make format        Format all code (Scala, site, docs-lint)"
	@echo "  make lint          Lint all code (scalafmt check, site prettier, docs-lint)"
	@echo "  make lint-site     Lint site code"
	@echo "  make lint-docs     Lint Markdown across the whole repo"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean         Remove all build artifacts and caches"
	@echo "  make clean-core    Clean sbt/Scala build output"
	@echo "  make clean-site    Clean Astro build output and cache"
	@echo ""
	@echo "Combined:"
	@echo "  make all           Install + build + test (full development flow)"
	@echo "  make verify        Build + test (CI-like verification)"

# Setup & Installation
install:
	@echo "Installing project dependencies..."
	@cd site && npm install
	@cd docs-lint && npm install
	@echo "Installation complete"

# Development
dev:
	@cd site && npm run dev

# Building
build: build-core build-site
	@echo "All build targets complete"

build-core:
	@echo "Cross-compiling the Scala core + CLI..."
	@sbt compile

build-site:
	@echo "Building Astro docs site..."
	@cd site && npm run build

# Testing
test: test-core test-site
	@echo "All tests passed"

test-core:
	@echo "Testing the Scala core + CLI (JVM + Scala.js)..."
	@sbt test

test-site:
	@echo "Testing site utilities..."
	@cd site && npm run test

# Code Quality
format:
	@echo "Formatting Scala code..."
	@sbt scalafmtAll
	@echo "Formatting site code..."
	@cd site && npm run format
	@echo "Formatting complete"

lint: lint-site lint-docs
	@echo "Checking Scala formatting..."
	@sbt scalafmtCheckAll
	@echo "All linting checks passed"

lint-site:
	@echo "Linting site code..."
	@cd site && npm run lint

lint-docs:
	@echo "Linting Markdown (repo-wide)..."
	@cd docs-lint && npm run lint:md

# Cleanup
clean: clean-core clean-site
	@echo "Cleanup complete"

clean-core:
	@echo "Cleaning sbt/Scala build output..."
	@rm -rf target project/target project/project core/*/target cli/*/target playground/*/target site-glue/*/target

clean-site:
	@echo "Cleaning Astro build..."
	@rm -rf site/dist site/.astro site/.cache site/.vite

# Combined workflows
all: install build test
	@echo "Full development setup complete"

verify: clean build test lint
	@echo "Full verification passed"
