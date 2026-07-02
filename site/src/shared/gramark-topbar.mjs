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
//   active   "home" | "tutorial" | "docs" | "lab" — which section is current
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
export const SECTIONS = ["home", "tutorial", "docs", "lab"];
export const LABELS = {
  home: "Home",
  tutorial: "Tutorial",
  docs: "Docs",
  lab: "Lab",
};

// Pure link resolver — exported so it can be unit-tested without a DOM.
export function resolveHref(section, base = "/") {
  const b = base.endsWith("/") ? base : base + "/";
  if (section === "tutorial") return `${b}tutorials/intro/`;
  if (section === "docs") return `${b}docs/overview/`;
  if (section === "lab") return null; // planned, not yet built — see docs/playground-spec.md
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
  .seg button {
    font: 500 0.75em/1 var(--font-ui, sans-serif);
    color: var(--fg-muted, #5b4d92);
    background: none;
    border: none;
    padding: 0.3125em 0.625em;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
  }
  .seg button:hover { color: var(--fg, #16181d); }
  .seg button:focus-visible { outline: 2px solid var(--accent, #0a8f63); outline-offset: 2px; }
  .seg button[aria-pressed="true"] {
    background: var(--bg, #fff);
    color: var(--accent, #0a8f63);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), 0 0 0 1px var(--border, #ddd6f8);
  }

  @media (max-width: 720px) {
    nav.ctx { display: none; }
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
    .seg button { padding: 0.25em 0.5em; font-size: 0.6875em; }
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

  <div class="divider"></div>
  <div class="tools" part="tools"><slot name="tools"></slot></div>
  <div class="spacer"></div>

  <nav class="ctx" part="nav" id="ctx"></nav>

  <div class="divider"></div>
  <div class="seg" id="theme" role="group" aria-label="Theme">
    <button type="button" data-val="light" aria-pressed="false">Light</button>
    <button type="button" data-val="auto" aria-pressed="true">Auto</button>
    <button type="button" data-val="dark" aria-pressed="false">Dark</button>
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
    this._media =
      typeof matchMedia === "function"
        ? matchMedia("(prefers-color-scheme: dark)")
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
  _effective(mode) {
    return mode === "auto" ? (this._media?.matches ? "dark" : "light") : mode;
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
