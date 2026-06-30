import type { APIRoute } from "astro";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  fileURLToPath(new URL("../../../../../", import.meta.url)),
);

export const POST: APIRoute = async ({ request }) => {
  let source = "";

  try {
    const bodyText = await request.text();
    if (bodyText) {
      try {
        const payload = JSON.parse(bodyText) as { source?: unknown };
        if (typeof payload.source === "string") {
          source = payload.source;
        }
      } catch {
        source = bodyText;
      }
    }
  } catch {
    source = "";
  }

  if (!source.trim()) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "No grammar source was provided.",
        diagnostics: ["The request body did not contain grammar source."],
      }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      },
    );
  }

  const dir = mkdtempSync(path.join(tmpdir(), "grammark-"));
  const tmpFile = path.join(dir, "grammar.gram.md");
  writeFileSync(tmpFile, source, "utf8");

  try {
    const output = execFileSync(
      "spago",
      [
        "run",
        "--main",
        "Grammark.Cli",
        "--",
        "emit",
        tmpFile,
        "--backend",
        "ir",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Parsed by the real Grammark parser.",
        diagnostics: [],
        raw: output,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parser failure";
    return new Response(
      JSON.stringify({ success: false, message, diagnostics: [message] }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
