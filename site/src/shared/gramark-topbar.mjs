// SPDX-License-Identifier: Apache-2.0
//
// <gramark-topbar> — the ONE app topbar, rendered by a single zero-dependency
// custom element instead of two independent Astro composition paths (a bare
// page vs. Starlight's `Header` component override). That split was the root
// cause of a whole bug class this file retires: Starlight's own `.header`
// wrapper doubling up on padding, `[data-theme="dark"] .knob`-style ancestor
// selectors that Astro's per-file style scoping silently broke, and token
// mismatches between the two rendering paths. Shadow DOM gives real style
// isolation (not a scoping-class hack), and inherits the page's design
// tokens (`var(--accent)` etc.) straight through the shadow boundary, so the
// bar themes correctly wherever it's mounted. Modeled on the same pattern in
// github.com/wstein/flatbars (`shared/flatbars-topbar.mjs`) — kept as a
// standalone module (not an .astro component) specifically so a future,
// non-Astro Lab surface (docs/playground-spec.md M4+) can mount it too.
//
// Attributes (all optional; `data-*` aliases accepted):
//   active   "home" | "tutorial" | "docs" | "lab" | "notebook" — which section
//            is current
//   base     the deploy base path (import.meta.env.BASE_URL, e.g. "/gramark/"
//            in CI, "/" locally) — every link is resolved from it, so a
//            hand-written `href="/tutorials/intro/"` string (which Astro does
//            NOT rewrite for you outside its own template href/src
//            attributes) never goes stale under the GitHub Pages base again.
//
// Slots:
//   tools    the search affordance — Starlight's own `<Search />` is slotted
//            in by the host (AppShell.astro) rather than reimplemented here,
//            so Pagefind indexing keeps working unchanged.
//
// Theme: a 3-way Light/Auto/Dark segmented control, storing to the SAME
// `starlight-theme` localStorage key Starlight's own inline `ThemeProvider`
// seeds `data-theme` from (its script runs synchronously in <head>, before
// this element upgrades, so first paint is never a guess this element then
// has to correct — no flash on Starlight pages). Absence of the key IS the
// "auto" state, matching Starlight's own convention exactly, and this
// element additionally tracks `prefers-color-scheme` live while in auto so a
// live OS theme change is reflected without a reload. The bare Landing page
// has no Starlight `ThemeProvider`; its own inline seed script (in
// `index.astro`'s `<head>`) replicates the identical algorithm against the
// same key, so both surfaces agree on one source of truth.

export const THEME_KEY = "starlight-theme";
export const SECTIONS = ["home", "tutorial", "docs", "lab", "notebook"];
export const LABELS = {
  home: "Home",
  tutorial: "Tutorial",
  docs: "Docs",
  lab: "Lab",
  notebook: "Notebook",
};

// Pure link resolver — exported so it can be unit-tested without a DOM.
export function resolveHref(section, base = "/") {
  const b = base.endsWith("/") ? base : base + "/";
  if (section === "tutorial") return `${b}tutorials/intro/`;
  if (section === "docs") return `${b}docs/overview/`;
  if (section === "lab") return `${b}lab/`;
  if (section === "notebook") return `${b}notebook/`;
  return b; // home
}

const TEMPLATE = `
<style>
  :host {
    display: block;
    font-family: var(--font-ui, system-ui, sans-serif);
    /* Pin a fixed base so the bar renders identically on any host regardless
       of the host's root font-size — the styles below size in em units,
       shadow-relative to this, so they never inherit the page root. */
    font-size: 16px;
    /* Starlight wraps its own Header slot in a position:fixed .header box
       (PageFrame.astro), so Docs/Specs/Tutorials/Brand already stay pinned
       while their content scrolls underneath. The bare Landing/Lab pages
       mount this element directly with no such wrapper, so without this it
       scrolled away with the rest of the page — a real behavioral split
       between page pipelines, not a deliberate one (unlike Landing's own
       body-scroll-vs-trapped-scroll divergence, which design/README.md
       documents on purpose). Sticky, rather than fixed, needs no matching
       content offset on the pages that don't already have one from
       Starlight. top:0 and z-index:10 match Starlight's own .header
       exactly so both pipelines layer identically.
    */
    position: sticky;
    top: 0;
    z-index: 10;
  }
  *, *::before, *::after { box-sizing: border-box; }

  .bar {
    display: flex;
    align-items: center;
    gap: 1.125em;
    padding: 0.25em 1.375em;
    border-bottom: 1px solid var(--border, #ddd6f8);
    background: var(--bg, #fff);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5625em;
    text-decoration: none;
    flex: none;
  }
  .brand:focus-visible { outline: 2px solid var(--accent, #0a8f63); outline-offset: 3px; border-radius: 4px; }
  .mark { flex: none; display: block; }
  .wm {
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
    font-size: 2em;
    white-space: nowrap;
  }
  .wm .ink { color: var(--fg, #16181d); }
  .wm .split {
    background: linear-gradient(90deg, var(--fg, #16181d) 0 50%, var(--accent, #0a8f63) 50% 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
  }
  .wm .accent { color: var(--accent, #0a8f63); }

  .divider { width: 1px; height: 18px; background: var(--border, #ddd6f8); flex: none; }

  .tools { display: flex; align-items: center; flex: none; }
  ::slotted([slot="tools"]) { width: 200px; }
  /* A page-supplied page-tools slot (AppShell.astro's own slot, distinct from THIS native
     tools slot) right-aligns flush against the nav links instead of sitting flush left next
     to the brand, where Search's fixed-width box is meant to sit. margin-left:auto on .tools
     ALONE is not enough: flex-grow gets first claim on a flex line's free space, resolved
     BEFORE auto margins get whatever's left over — since .spacer already has flex:1, it
     always wins that space first, leaving auto margins elsewhere permanently at 0 (confirmed
     empirically: margin-left:auto on .tools alone measured 0px). Neutralizing .spacer's own
     flex-grow, scoped to the same case, frees that space for .tools's auto margin to actually
     consume instead. :host([data-page-tools="true"]) scopes all three rules below to a page
     with its own page-tools content specifically (the Notebook's view toggle + download
     actions, or the Lab's Example/Engine/Start-rule controls) — every other page Search still
     uses is untouched. Matched against the literal string "true", not just attribute PRESENCE:
     Astro renders the data-page-tools attribute as the literal string "false" when its value is
     false (confirmed against the built HTML), not an omitted attribute, so a bare presence
     check would incorrectly match every page.
     Also widens the slot itself past Search's fixed 200px: at 200px, the Notebook's five
     controls (Notebook/Source/Paper + the two download buttons) wrapped to two rows, which
     would have made THIS shared component's own height content-dependent per page — including
     silently invalidating lab.css's own .lab height: calc(100vh - 49px) rule (that 49px is
     this bar's own single-row height), a bug this same width fix also happens to prevent, not
     just a cosmetic one. Plain width:auto (no min-width floor guessed at a fixed pixel count) —
     the Notebook's five controls and the Lab's three dropdowns each have their own real,
     already-correct natural width; a min-width big enough for one is bigger than the other
     actually needs, and the leftover space inside that oversized box left-aligns by default
     (ordinary inline flow, nothing in this rule centers or right-justifies a slotted box's own
     CONTENT), landing as dead space between the controls and Home instead of closing the gap —
     confirmed empirically (a 420px floor measured a 79px gap to Home, most of it exactly that
     unused leftover), not just assumed safe. */
  :host([data-page-tools="true"]) .spacer { flex: none; }
  :host([data-page-tools="true"]) .tools { margin-left: auto; }
  :host([data-page-tools="true"]) ::slotted([slot="tools"]) {
    width: auto;
  }
  /* The Lab's own page-tools content (Example/Engine/Start-rule) stays LEFT-aligned, flush next
     to the brand — unlike the Notebook's, which is right-aligned flush against the nav links.
     Both attribute selectors ([data-page-tools="true"][active="lab"]) together outweigh the
     general rules above (one more attribute selector = strictly higher specificity), so this
     cleanly overrides them for the Lab specifically without touching the Notebook's own
     right-aligned case. */
  :host([data-page-tools="true"][active="lab"]) .spacer { flex: 1; }
  :host([data-page-tools="true"][active="lab"]) .tools { margin-left: 0; }

  .spacer { flex: 1; }

  nav.ctx { display: flex; gap: 1.375em; flex: none; }
  nav.ctx a, nav.ctx span {
    font-size: 0.875em;
    font-weight: 500;
    color: var(--fg-muted, #5b4d92);
    text-decoration: none;
    cursor: pointer;
  }
  nav.ctx a[aria-current="page"] { font-weight: 600; color: var(--accent, #0a8f63); }
  nav.ctx span.soon { cursor: default; opacity: 0.55; }

  .seg {
    display: inline-flex;
    background: var(--bg-2, #f2effc);
    border: 1px solid var(--border, #ddd6f8);
    border-radius: 8px;
    padding: 2px;
    gap: 2px;
    flex: none;
  }
  /* Icon-only (sun/monitor/moon) — title gives sighted mouse users a native
     tooltip, aria-label carries the same word to assistive tech, since
     nothing here is visible text for either to read otherwise. The icon's
     currentColor stroke inherits the button's own color for free, so
     pressed/hover state needs no separate icon-color rule of its own — just
     the existing text-color rules below. */
  .seg button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-muted, #5b4d92);
    background: none;
    border: none;
    padding: 0.375em;
    border-radius: 6px;
    cursor: pointer;
  }
  .seg button svg { width: 1em; height: 1em; display: block; }
  .seg button:hover { color: var(--fg, #16181d); }
  .seg button:focus-visible { outline: 2px solid var(--accent, #0a8f63); outline-offset: 2px; }
  .seg button[aria-pressed="true"] {
    background: var(--bg, #fff);
    color: var(--accent, #0a8f63);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), 0 0 0 1px var(--border, #ddd6f8);
  }

  @media (max-width: 720px) {
    nav.ctx { display: none; }
    /* This divider separates the tools/page-tools content from nav.ctx specifically — pointless
       (and, measured directly, enough to push the theme control off-screen at 320px) once nav
       itself is hidden at this width. */
    .divider--nav { display: none; }
    /* .tools is itself display:flex, so its slotted child (a plain <div>)
       becomes a flex ITEM of it — width:auto on a flex item does NOT
       mean "fill the container" the way it does on a block element; without
       flex-grow it resolves via the item's own content size instead,
       shrinking only as far as flex-shrink's negotiation forces it to. That
       negotiation is sensitive to the item's OWN intrinsic content width,
       which is why this rendered inconsistently between pages even though
       the CSS is identical on both — an explicit flex:1 fills .tools's
       actual available width deterministically, regardless of content.
       min-width, not just flex:1, on .tools itself: Starlight's own
       sidebar-toggle hamburger (rendered outside this element, in
       PageFrame.astro's sidebar nav — not something this component
       controls) reserves extra space on its own .header wrapper below its
       ~50rem breakpoint, which Landing's bare page never has to reserve (no
       sidebar there at all) — without a floor, the search box was the only
       flexible item competing for whatever's left and collapsed to a
       near-invisible size on Starlight pages specifically. */
    ::slotted([slot="tools"]) { width: auto; min-width: 0; flex: 1; }
    .tools { flex: 1 1 auto; min-width: 88px; }
  }

  @media (max-width: 460px) {
    .bar { gap: 0.625em; padding-inline: 0.875em; }
    .seg button { padding: 0.25em; }
    /* Brand's wordmark alone is wider than the search box's own min-width
       floor. On a Starlight page, this width band is also where its
       sidebar-toggle hamburger's reserved space (see the comment above)
       bites hardest — without reclaiming room somewhere, the segmented
       theme control had nowhere left to go and rendered completely
       off-screen (clipped by Starlight's own overflow handling, not even
       scrollable to) rather than just visually tight like on Landing.
       Dropping to icon-only keeps the brand recognizable without costing
       everything else that needs the room more at this width. */
    .wm { display: none; }
  }
</style>

<div class="bar" part="bar">
  <a class="brand" part="brand" id="brand">
    <svg class="mark" viewBox="0 0 96 96" width="40" height="40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gramark">
      <g transform="matrix(1.3665595,0,0,1.3665595,-17.594856,-17.594856)" fill="none" stroke="var(--fg, #16181d)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 18,48 H 33"></path>
        <path d="M 63,48 C 70,48 71,31 78,31"></path>
        <path d="M 63,48 C 70,48 71,65 78,65"></path>
        <rect x="33" y="36" width="30" height="24" rx="12" fill="var(--node, #10b981)" stroke="var(--fg, #16181d)" stroke-width="6"></rect>
      </g>
    </svg>
    <span class="wm"><span class="ink">Gra</span><span class="split">m</span><span class="accent">ark</span></span>
  </a>

  <div class="divider" id="tools-divider"></div>
  <div class="tools" part="tools"><slot name="tools"></slot></div>
  <div class="spacer"></div>

  <div class="divider divider--nav"></div>
  <nav class="ctx" part="nav" id="ctx"></nav>

  <div class="divider"></div>
  <div class="seg" id="theme" role="group" aria-label="Theme">
    <button type="button" data-val="light" aria-pressed="false" aria-label="Light" title="Light">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="3"></circle>
        <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2 3.1 3.1"></path>
      </svg>
    </button>
    <button type="button" data-val="auto" aria-pressed="true" aria-label="Auto" title="Auto">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="9" rx="1.5"></rect>
        <path d="M5.5 14.5h5M8 11.5v3"></path>
      </svg>
    </button>
    <button type="button" data-val="dark" aria-pressed="false" aria-label="Dark" title="Dark">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.25 4.25 0 0 0 7 7Z"></path>
      </svg>
    </button>
  </div>
</div>
`;

// Conditional base so the module is importable in plain Node (where
// HTMLElement is absent) to reach the exported pure helpers in tests; in a
// browser this is the real HTMLElement and the element upgrades normally.
const Base = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export class GramarkTopbar extends Base {
  static get observedAttributes() {
    return ["active", "base"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = TEMPLATE;
    // Queries the LIGHT preference specifically (not dark), matching index.astro/lab.astro's own
    // inline seed scripts exactly — both branches must default the SAME way when neither preference
    // matches (a browser with no prefers-color-scheme support), or first paint (seeded from the
    // inline script, before this element upgrades) and this element's own later recomputation could
    // disagree and flash. Matching the query direction, not just the resulting light/dark string, is
    // what keeps `_effective` a literal mirror of the seed's own ternary below.
    this._media =
      typeof matchMedia === "function"
        ? matchMedia("(prefers-color-scheme: light)")
        : null;
    this._onThemeClick = this._onThemeClick.bind(this);
    this._onMediaChange = this._onMediaChange.bind(this);
    this._onStorage = this._onStorage.bind(this);
  }

  _attr(name, fallback = "") {
    return (
      this.getAttribute(name) ?? this.getAttribute("data-" + name) ?? fallback
    );
  }
  get active() {
    const s = this._attr("active", "").toLowerCase();
    return SECTIONS.includes(s) ? s : null;
  }
  get base() {
    return this._attr("base", "/");
  }

  connectedCallback() {
    this._render();
    this.shadowRoot
      .getElementById("theme")
      .addEventListener("click", this._onThemeClick);
    this._media?.addEventListener("change", this._onMediaChange);
    window.addEventListener("storage", this._onStorage);
    this._syncTheme();

    // Lab has no slotted `tools` content (see AppShell.astro's own
    // comment — a search box with nothing indexed to search is confusing,
    // not just unhelpful). Without this, the divider meant to separate the
    // brand from the search box rendered right next to the brand with
    // nothing after it: an orphaned mark, not an absence.
    const toolsSlot = this.shadowRoot.querySelector('slot[name="tools"]');
    this._syncToolsDivider(toolsSlot);
    toolsSlot.addEventListener("slotchange", () =>
      this._syncToolsDivider(toolsSlot),
    );
  }

  _syncToolsDivider(toolsSlot) {
    const hasTools = toolsSlot.assignedElements().length > 0;
    this.shadowRoot.getElementById("tools-divider").hidden = !hasTools;
  }

  disconnectedCallback() {
    this._media?.removeEventListener("change", this._onMediaChange);
    window.removeEventListener("storage", this._onStorage);
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  _render() {
    this.shadowRoot.getElementById("brand").href = resolveHref(
      "home",
      this.base,
    );

    const ctx = this.shadowRoot.getElementById("ctx");
    const active = this.active;
    ctx.innerHTML = SECTIONS.map((s) => {
      const href = resolveHref(s, this.base);
      if (href === null) {
        return `<span class="soon" title="Planned — not yet built">${LABELS[s]}</span>`;
      }
      const current = s === active ? ' aria-current="page"' : "";
      return `<a href="${href}"${current}>${LABELS[s]}</a>`;
    }).join("");
  }

  // ── theme: a 3-way Light/Auto/Dark segmented control over the SAME
  // `starlight-theme` key Starlight's own inline ThemeProvider seeds
  // data-theme from — absence of the key IS "auto", matching its convention.
  _mode() {
    let stored;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      stored = null;
    }
    return stored === "light" || stored === "dark" ? stored : "auto";
  }
  // Mirrors index.astro/lab.astro's own inline seed script exactly: query the LIGHT preference,
  // default to dark when it doesn't match (covers both "prefers dark" and "prefers neither" —
  // matchMedia queries never throw, they just never match on an unsupported/absent preference).
  _effective(mode) {
    return mode === "auto" ? (this._media?.matches ? "light" : "dark") : mode;
  }
  _syncTheme() {
    const mode = this._mode();
    this.shadowRoot.querySelectorAll("#theme button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.val === mode));
    });
  }
  _apply(mode) {
    document.documentElement.dataset.theme = this._effective(mode);
    this._syncTheme();
  }
  _setMode(mode) {
    try {
      if (mode === "auto") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, mode);
    } catch {
      /* storage unavailable (private mode) — theme still applies for this load */
    }
    this._apply(mode);
    this.dispatchEvent(
      new CustomEvent("gramark:themechange", {
        detail: { mode },
        bubbles: true,
        composed: true,
      }),
    );
  }
  _onThemeClick(e) {
    const btn = e.target.closest("button[data-val]");
    if (btn) this._setMode(btn.dataset.val);
  }
  _onMediaChange() {
    if (this._mode() === "auto") this._apply("auto");
  }
  _onStorage(e) {
    if (e.key === THEME_KEY) this._apply(this._mode());
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("gramark-topbar")
) {
  customElements.define("gramark-topbar", GramarkTopbar);
}
