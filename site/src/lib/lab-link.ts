// Shared encode/decode for the "Open in Lab ↗" handoff. The writer (the
// LiveGrammar island, the OpenInLab chip) and the reader (lab.astro) must
// agree on the format, so both import it from here — they cannot drift.
//
// The grammar + input travel in the URL *hash* (`#g=…&i=…`, URL-safe base64
// of the UTF-8 bytes), not a query string: the hash never hits the network,
// so a shared grammar stays as private as one typed into the Lab directly.
// A short `?grammar=calc|json|lr` preset is also honored for the docs chips.

export interface LabLink {
  grammar?: string;
  input?: string;
  preset?: string;
}

// btoa/atob operate on Latin-1; round-trip through encodeURIComponent so any
// UTF-8 (the `{% … %}`, the `→`) survives, then make it URL-safe.
function encode(text: string): string {
  const b64 = btoa(
    encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    ),
  );
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(enc: string): string {
  const b64 = enc.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  return decodeURIComponent(
    Array.from(
      bin,
      (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join(""),
  );
}

/** Build a Lab URL that preloads `grammar` (+ optional `input`). */
export function labGrammarHref(
  base: string,
  grammar: string,
  input?: string,
): string {
  const parts = [`g=${encode(grammar)}`];
  if (input != null) parts.push(`i=${encode(input)}`);
  return `${base}lab#${parts.join("&")}`;
}

/** Build a Lab URL that loads a named preset (`calc` | `json` | `lr`). */
export function labPresetHref(base: string, preset: string): string {
  return `${base}lab?grammar=${encodeURIComponent(preset)}`;
}

/** Read a preloaded grammar/input/preset from the current location, if any. */
export function readLabLink(loc: { hash: string; search: string }): LabLink {
  const out: LabLink = {};
  const preset = new URLSearchParams(loc.search).get("grammar");
  if (preset) out.preset = preset;
  const hash = loc.hash.startsWith("#") ? loc.hash.slice(1) : loc.hash;
  const params = new URLSearchParams(hash);
  const g = params.get("g");
  const i = params.get("i");
  try {
    if (g) out.grammar = decode(g);
    if (i != null) out.input = decode(i);
  } catch {
    /* malformed hash — ignore and fall back to the Lab default */
  }
  return out;
}
