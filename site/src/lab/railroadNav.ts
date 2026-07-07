// Shared nonterminal-node navigation wiring for a server-rendered railroad SVG
// (Railroad.scala's renderSvg), reused by both the Lab island and the Notebook
// island so the two don't grow their own, subtly-diverging DOM-query logic.
//
// Railroad.scala wraps every symbol box in a `<g class="rr-node rr-node-term|
// rr-node-nonterm" data-rr-kind="..." data-rr-label="...">` — this binds
// directly to that grouping instead of the legacy `rect.rr-nonterm` + its
// text sibling, so a single listener per node covers both the box and its
// label (they're the same click/hover target, not two that happen to
// overlap).

export interface RailroadNodeNavHandlers {
  /** A nonterminal node gained hover/focus. Optional: a caller with no cross-highlight to drive
   * (e.g. the Notebook, which has no equivalent of the Lab's `hoverRule` signal) may omit it. */
  onEnter?: (label: string) => void;
  /** The node lost hover/focus. */
  onLeave?: () => void;
  /** The node was activated (click, or Enter/Space with focus) — navigate to that rule. */
  onSelect: (label: string) => void;
}

// Binds hover + click + keyboard activation to every nonterminal node under `root` and returns a
// cleanup that removes all of it — call from a `useEffect` keyed on the SVG markup, since
// `dangerouslySetInnerHTML` content starts out fully inert and gets replaced wholesale on every
// re-render.
export function bindRailroadNodeNav(
  root: Element,
  handlers: RailroadNodeNavHandlers,
): () => void {
  const cleanups: Array<() => void> = [];
  root
    .querySelectorAll<SVGGElement>("g.rr-node-nonterm[data-rr-label]")
    .forEach((g) => {
      const label = g.dataset.rrLabel;
      if (!label) return;
      const onMouseEnter = () => handlers.onEnter?.(label);
      const onMouseLeave = () => handlers.onLeave?.();
      // `stopPropagation` matters here: both islands nest this SVG inside a larger
      // click/keydown-handling container (a cell's own "click to edit" surface, in the
      // Notebook's case) — activating a nonterminal reference must navigate, never ALSO
      // trigger whatever the ancestor's own activation does.
      const onClick = (e: MouseEvent) => {
        e.stopPropagation();
        handlers.onSelect(label);
      };
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        handlers.onSelect(label);
      };
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", `Go to rule ${label}`);
      g.style.cursor = "pointer";
      g.addEventListener("mouseenter", onMouseEnter);
      g.addEventListener("mouseleave", onMouseLeave);
      g.addEventListener("click", onClick);
      g.addEventListener("keydown", onKeyDown);
      cleanups.push(() => {
        g.removeEventListener("mouseenter", onMouseEnter);
        g.removeEventListener("mouseleave", onMouseLeave);
        g.removeEventListener("click", onClick);
        g.removeEventListener("keydown", onKeyDown);
      });
    });
  return () => cleanups.forEach((c) => c());
}
