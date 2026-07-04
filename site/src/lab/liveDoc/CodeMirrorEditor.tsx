import { useEffect, useRef } from "preact/hooks";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";

// A thin Preact wrapper around a single CodeMirror 6 EditorView — the Live Document notebook's
// per-cell editor (docs/playground-spec.md's "Live Document notebook, phase 3" note). Plain text,
// no `.gram` language mode: writing a CodeMirror Lezer grammar for Gramaire's own notation is a
// separate, much larger undertaking (out of scope for this first cell prototype) — `basicSetup`
// alone (line numbers, history, bracket matching, fold gutter) is already a large step up from a
// plain `<textarea>`.

/** A cell-local diagnostic to underline in the editor: `from`/`to` are offsets into THIS cell's
 * own text (the notebook converts each engine diagnostic's document-wide span to cell-local by
 * subtracting the cell's start offset before passing it here — Layer 3). */
export interface EditorDiagnostic {
  from: number;
  to: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface CodeMirrorEditorProps {
  value: string;
  onChange: (text: string) => void;
  /** Fires when the editor loses focus — the notebook's cells commit-and-collapse-to-rendered-
   * view on blur, the same interaction prose blocks already use. */
  onBlur?: () => void;
  /** Grabs focus once, on mount — for a cell that just switched into edit mode. */
  autoFocus?: boolean;
  /** Squiggle underlines for located diagnostics, in cell-local coordinates. */
  diagnostics?: readonly EditorDiagnostic[];
  /** Extra CodeMirror extensions (e.g. a custom theme) layered on top of `basicSetup`. */
  extensions?: Extension[];
  className?: string;
}

export function CodeMirrorEditor({
  value,
  onChange,
  onBlur,
  autoFocus,
  diagnostics,
  extensions,
  className,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Avoids the feedback loop where a parent-driven `value` update (itself caused by this
  // component's own onChange) gets pushed back into CodeMirror as a second, redundant
  // transaction — which would reset the cursor/selection on every keystroke.
  const lastEmitted = useRef<string>(value);
  // The EditorView is created once (below) and must not be torn down on every keystroke (that
  // would reset cursor/undo history) — but `onChange`/`onBlur` are fresh closures every render
  // (Preact, like React, gives no stable-identity guarantee for an inline arrow function prop).
  // Closing over them directly in the mount-once effect below would call only the FIRST render's
  // closure forever, which captures that render's `blocks`/`index` (the notebook's own closure
  // state) — every edit after the first would then diff against a stale block list, producing a
  // document text that doesn't match what CodeMirror already holds, which the `[value]` effect
  // below would "correct" by dispatching AGAIN, which re-fires this listener, which calls the
  // same stale closure again — an infinite synchronous dispatch loop that freezes the tab (caught
  // empirically: the 2nd keystroke hung indefinitely in manual browser verification). A ref
  // updated every render, dereferenced inside the listener, always calls the latest closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          ...(extensions ?? []),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const text = update.state.doc.toString();
            lastEmitted.current = text;
            onChangeRef.current(text);
          }),
          EditorView.domEventHandlers({
            blur: () => onBlurRef.current?.(),
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    if (autoFocus) view.focus();
    return () => view.destroy();
    // Deliberately mount-once for `extensions`/`value`/`autoFocus`: re-creating the EditorView on
    // every prop change would reset cursor/undo history. `onChange`/`onBlur` are never stale (see
    // the refs above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External `value` changes (switching cells, an example load, an undo outside this editor) that
  // didn't originate from this editor's own `updateListener` — push them in as a fresh document.
  // Callers must NOT feed this editor's own `onChange` output back into `value` (e.g. through a
  // shared signal) while it's actively being typed into: rapid keystrokes can fire the
  // updateListener for keystroke N+1 before Preact has re-rendered with keystroke N's value, so
  // this effect can run with a STALE `value` (from the N-th render) after `lastEmitted` has
  // already moved on to N+1's text — it would then dispatch the stale text back into CodeMirror,
  // which re-fires the updateListener, which feeds the stale text back into `value` again: a
  // ping-pong loop between the two most recent keystrokes that never settles (caught empirically:
  // typing 2+ rapid characters hung indefinitely). `value` should be a stable snapshot during
  // editing (the notebook passes the cell's original, pre-edit text, unchanged until a separate
  // commit-on-blur step) so this effect only ever fires for genuine external changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === lastEmitted.current) return;
    lastEmitted.current = value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  // Layer 3 — push externally-sourced diagnostics (the engine's, mapped to cell-local offsets by
  // the caller) into CodeMirror's own lint machinery as squiggle underlines with hover messages.
  // `setDiagnostics` auto-enables the lint extension, so nothing extra is needed in the base
  // config. Clamp to the current doc length: an offset can momentarily exceed it while the last
  // response's diagnostics linger against a since-shortened buffer, and an out-of-range range
  // throws inside CodeMirror.
  const diagKey = JSON.stringify(diagnostics ?? []);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const len = view.state.doc.length;
    const cm: Diagnostic[] = (diagnostics ?? [])
      .map((d) => ({
        from: Math.max(0, Math.min(d.from, len)),
        to: Math.max(0, Math.min(d.to, len)),
        severity: d.severity,
        message: d.message,
      }))
      .filter((d) => d.to >= d.from);
    view.dispatch(setDiagnostics(view.state, cm));
    // Keyed on the serialized diagnostics so this only re-dispatches when they actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagKey]);

  return <div ref={hostRef} className={className} />;
}
