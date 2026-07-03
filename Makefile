.PHONY: help install install-site build build-site build-core dev-site test test-core format lint lint-docs lint-site clean clean-core clean-site all verify fmt check strip regen-examples check-examples strip-examples

# sbt lives in Homebrew's bin, which isn't always on PATH for non-interactive
# shells (cron, some editor task runners) — export it once here rather than
# depending on every developer's shell rc.
export PATH := /opt/homebrew/bin:$(PATH)

# Every literate grammar file under grammar/ and examples/ (found, not
# hardcoded, so a newly added .gram.md is covered automatically) — minus
# deliberate showcase exceptions that opt out of the CI drift-gate contract.
# Keep EXAMPLE_EXCLUDE in sync with GramaireCheckSuite.scala's `gatedFiles`
# (the Scala-side source of truth this glob mirrors).
EXAMPLE_EXCLUDE := examples/ECMA-404.gram.md
EXAMPLE_FILES := $(filter-out $(EXAMPLE_EXCLUDE),$(shell find grammar examples -name '*.gram.md' | sort))

# Native `.gram` files (ADR D36, first-class since GramaireCheck's native check/fmt/lock gate) —
# standalone ones only, i.e. those with no `.gram.md` sibling. A `.gram` that DOES have a sibling
# is that sibling's derived, gitignored `strip` projection, already swept by strip-examples above
# via the `.gram.md` file list, not a first-class file of its own.
NATIVE_EXAMPLE_FILES := $(shell find grammar examples -name '*.gram' | sort | \
	while read -r f; do [ -f "$$f.md" ] || echo "$$f"; done)

# Gramaire project task manager
# Provides a unified interface for building, testing, and developing across:
# - Core Scala compiler + CLI (via sbt, cross-built to JVM and Scala.js)
# - Markdown lint (via npm in docs-lint/)
# - The Astro + Starlight docs site (via npm in site/)

help:
	@echo "Gramaire - Make targets"
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
	@echo "Grammar files (.gram.md and first-class .gram):"
	@echo "  make fmt FILE=x.gram.md|x.gram      Regenerate one file's tables/diagrams/lock"
	@echo "  make check FILE=x.gram.md|x.gram    Check one file's structure + drift gates"
	@echo "  make strip FILE=x.gram.md           Regenerate one .gram.md's native .gram projection"
	@echo "  make regen-examples                 Regenerate all discovered example files"
	@echo "  make check-examples                 Check all discovered example files"
	@echo "  make strip-examples                 Regenerate .gram projections for .gram.md examples"
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

# Grammar files (.gram.md)
#
# fmt/check/strip take a single FILE=path/to/x.gram.md for ad hoc use;
# regen-examples/check-examples/strip-examples sweep the discovered
# EXAMPLE_FILES set (fmt pinned to --inline-source, the same set CI's own
# "gramaire check"/"Derived artifacts are up to date" steps exercise —
# .github/workflows/ci.yml) — run these locally before pushing to catch
# drift before CI does.
fmt:
	@test -n "$(FILE)" || (echo "usage: make fmt FILE=path/to/x.gram.md" && exit 1)
	@sbt -batch "cli/runMain gramaire.cli.Main fmt --diagrams=sidecar $(FILE)"

check:
	@test -n "$(FILE)" || (echo "usage: make check FILE=path/to/x.gram.md" && exit 1)
	@sbt -batch "cli/runMain gramaire.cli.Main check $(FILE)"

# The native .gram projection (ADR D36): a derived, fence-free, ANTLR-style
# export of a .gram.md file — never edited by hand, never committed (*.gram
# is gitignored), safe to regenerate freely. `.gram.md` stays the single
# source of truth; this just serves the ecosystem (editors, linguist,
# generators) that expects a plain grammar file that doesn't read as
# Markdown.
strip:
	@test -n "$(FILE)" || (echo "usage: make strip FILE=path/to/x.gram.md" && exit 1)
	@sbt -batch "cli/runMain gramaire.cli.Main strip $(FILE)"

regen-examples:
	@echo "Regenerating derived artifacts for the discovered .gram.md example files..."
	@for f in $(EXAMPLE_FILES); do \
		sbt -batch "cli/runMain gramaire.cli.Main fmt --diagrams=sidecar --inline-source $$f"; \
	done
	@echo "Regenerating standalone native .gram example files..."
	@for f in $(NATIVE_EXAMPLE_FILES); do \
		sbt -batch "cli/runMain gramaire.cli.Main fmt $$f"; \
	done
	@echo "Done — run 'git diff' to review, or 'make check-examples' to verify."

check-examples:
	@echo "Checking structure + drift for the discovered .gram.md example files..."
	@for f in $(EXAMPLE_FILES); do \
		sbt -batch "cli/runMain gramaire.cli.Main check $$f"; \
	done
	@echo "Checking structure + drift for standalone native .gram example files..."
	@for f in $(NATIVE_EXAMPLE_FILES); do \
		sbt -batch "cli/runMain gramaire.cli.Main check $$f"; \
	done

strip-examples:
	@echo "Regenerating native .gram projections for the discovered .gram.md example files..."
	@for f in $(EXAMPLE_FILES); do \
		sbt -batch "cli/runMain gramaire.cli.Main strip $$f"; \
	done

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
