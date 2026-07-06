import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("static wordmark uses the Gramaire Gram/aire color split, not the old split-m treatment", () => {
  const svg = readRepoFile("brand/gramaire-wordmark.svg");

  expect(svg).toContain('<tspan class="wm-gram">Gram</tspan>');
  expect(svg).toContain('<tspan fill="#0a8f63">aire</tspan>');
  expect(svg).not.toContain("mSplit");
  expect(svg).not.toContain("linearGradient");
});

test("site wordmark component does not reintroduce a hard-stop gradient on the middle m", () => {
  const component = readRepoFile("site/src/components/Wordmark.astro");

  expect(component).toContain('style="color:var(--fg)">Gram</span>');
  expect(component).toContain('style="color:var(--accent)"');
  expect(component).toContain(">aire</span");
  expect(component).not.toContain("linear-gradient");
  expect(component).not.toContain("background-clip:text");
});
