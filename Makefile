.PHONY: help install install-site build build-site build-core dev-site test test-core format lint lint-docs lint-site clean clean-core clean-site all verify

# Gramark project task manager
# Provides a unified interface for building, testing, and developing across:
# - Core Scala compiler + CLI (via sbt, cross-built to JVM and Scala.js)
# - Markdown lint (via npm in docs-lint/)
# - The Astro + Starlight docs site (via npm in site/)

help:
	@echo "Gramark - Make targets"
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make install       Install all dependencies (docs-lint, site npm)"
	@echo ""
	@echo "Building:"
	@echo "  make build         Build all components (core, site)"
	@echo "  make build-core    Cross-compile the Scala core + CLI (sbt compile)"
	@echo "  make build-site    Build the Astro + Starlight site (site/dist)"
	@echo "  make dev-site      Run the site's local dev server"
	@echo ""
	@echo "Testing:"
	@echo "  make test          Run all tests (core, cli)"
	@echo "  make test-core     Run the Scala test suite (sbt test)"
	@echo ""
	@echo "Code Quality:"
	@echo "  make format        Format all code (Scala)"
	@echo "  make lint          Lint all code (scalafmt check, docs-lint, site)"
	@echo "  make lint-docs     Lint Markdown across the whole repo"
	@echo "  make lint-site     Check the site's Prettier formatting"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean         Remove all build artifacts and caches"
	@echo "  make clean-core    Clean sbt/Scala build output"
	@echo "  make clean-site    Clean the site's build output"
	@echo ""
	@echo "Combined:"
	@echo "  make all           Install + build + test (full development flow)"
	@echo "  make verify        Build + test (CI-like verification)"

# Setup & Installation
install: install-site
	@echo "Installing project dependencies..."
	@cd docs-lint && npm install
	@echo "Installation complete"

install-site:
	@echo "Installing site dependencies..."
	@cd site && npm install

# Building
build: build-core build-site
	@echo "All build targets complete"

build-core:
	@echo "Cross-compiling the Scala core + CLI..."
	@sbt compile

build-site:
	@echo "Building the Astro + Starlight site..."
	@cd site && npm run build

dev-site:
	@cd site && npm run dev

# Testing
test: test-core
	@echo "All tests passed"

test-core:
	@echo "Testing the Scala core + CLI (JVM + Scala.js)..."
	@sbt test

# Code Quality
format:
	@echo "Formatting Scala code..."
	@sbt scalafmtAll
	@echo "Formatting complete"

lint: lint-docs lint-site
	@echo "Checking Scala formatting..."
	@sbt scalafmtCheckAll
	@echo "All linting checks passed"

lint-docs:
	@echo "Linting Markdown (repo-wide)..."
	@cd docs-lint && npm run lint:md

lint-site:
	@echo "Checking site formatting (Prettier)..."
	@cd site && npm run lint

# Cleanup
clean: clean-core clean-site
	@echo "Cleanup complete"

clean-core:
	@echo "Cleaning sbt/Scala build output..."
	@rm -rf target project/target project/project core/*/target cli/*/target

clean-site:
	@echo "Cleaning site build output..."
	@rm -rf site/dist site/.astro

# Combined workflows
all: install build test
	@echo "Full development setup complete"

verify: clean build test lint
	@echo "Full verification passed"
