.PHONY: help install build dev test format lint clean all

# Gramaire project task manager
# Provides a unified interface for building, testing, and developing across:
# - Core Scala compiler + CLI (via sbt, cross-built to JVM and Scala.js)
# - Markdown lint (via npm in docs-lint/)

help:
	@echo "Gramaire - Make targets"
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make install       Install all dependencies (docs-lint npm)"
	@echo ""
	@echo "Building:"
	@echo "  make build         Build all components (core)"
	@echo "  make build-core    Cross-compile the Scala core + CLI (sbt compile)"
	@echo ""
	@echo "Testing:"
	@echo "  make test          Run all tests (core, cli)"
	@echo "  make test-core     Run the Scala test suite (sbt test)"
	@echo ""
	@echo "Code Quality:"
	@echo "  make format        Format all code (Scala)"
	@echo "  make lint          Lint all code (scalafmt check, docs-lint)"
	@echo "  make lint-docs     Lint Markdown across the whole repo"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean         Remove all build artifacts and caches"
	@echo "  make clean-core    Clean sbt/Scala build output"
	@echo ""
	@echo "Combined:"
	@echo "  make all           Install + build + test (full development flow)"
	@echo "  make verify        Build + test (CI-like verification)"

# Setup & Installation
install:
	@echo "Installing project dependencies..."
	@cd docs-lint && npm install
	@echo "Installation complete"

# Building
build: build-core
	@echo "All build targets complete"

build-core:
	@echo "Cross-compiling the Scala core + CLI..."
	@sbt compile

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

lint: lint-docs
	@echo "Checking Scala formatting..."
	@sbt scalafmtCheckAll
	@echo "All linting checks passed"

lint-docs:
	@echo "Linting Markdown (repo-wide)..."
	@cd docs-lint && npm run lint:md

# Cleanup
clean: clean-core
	@echo "Cleanup complete"

clean-core:
	@echo "Cleaning sbt/Scala build output..."
	@rm -rf target project/target project/project core/*/target cli/*/target

# Combined workflows
all: install build test
	@echo "Full development setup complete"

verify: clean build test lint
	@echo "Full verification passed"
