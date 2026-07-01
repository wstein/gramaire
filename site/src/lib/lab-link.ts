// Shared encoding for handing a grammar (and optional sample input) from an
// embedded `GrammarTryout`'s "Open in Lab" link to the Lab page. The payload
// rides in the URL *hash*, so it never hits the network — consistent with the
// Lab's "private by construction" guarantee. Kept in one place so the writer
// (the component) and the reader (lab.astro) cannot disagree on the format.

export function labGrammarHref(
  base: string,
  grammar: string,
  input?: string,
): string {
  const params = new URLSearchParams({ g: grammar });
  if (input != null) params.set("i", input);
  return `${base}lab#${params.toString()}`;
}

export function decodeLabHash(hash: string): {
  grammar?: string;
  input?: string;
} {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const out: { grammar?: string; input?: string } = {};
  const g = params.get("g");
  const i = params.get("i");
  if (g != null) out.grammar = g;
  if (i != null) out.input = i;
  return out;
}
