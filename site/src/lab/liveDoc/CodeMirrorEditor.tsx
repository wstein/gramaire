import { useEffect, useRef } from "preact/hooks";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";

// A thin Preact wrapper around a single CodeMirror 6 EditorView — the Live Document notebook's
// per-cell editor (docs/playground-spec.md's "Live Document notebook, phase 3" note). Plain text,
// no `.gram` language mode: writing a CodeMirror Lezer grammar for Gramaire's own notation is a
// separate, much larger undertaking (out of scope for this first cell prototype) — `basicSetup`
// alone (line numbers, history, bracket matching, fold gutter) is already a large step up from a
// plain `<textarea>`.
export interface CodeMirrorEditorProps {
  value: string;
  onChange: (text: string) => void;
  /** Extra CodeMirror extensions (e.g. a custom theme) layered on top of `basicSetup`. */
  extensions?: Extension[];
  className?: string;
}

export function CodeMirrorEditor({
  value,
  onChange,
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
  // would reset cursor/undo history) — but `onChange` is a fresh closure every render (Preact,
  // like React, gives no stable-identity guarantee for an inline arrow function prop). Closing
  // over `onChange` directly in the mount-once effect below would call only the FIRST render's
  // closure forever, which captures that render's `blocks`/`index` (GrammarCellPreview's own
  // closure state) — every edit after the first would then diff against a stale block list,
  // producing a document text that doesn't match what CodeMirror already holds, which the
  // `[value]` effect below would "correct" by dispatching AGAIN, which re-fires this listener,
  // which calls the same stale `onChange` again — an infinite synchronous dispatch loop that
  // freezes the tab (caught empirically: the 2nd keystroke hung indefinitely in manual browser
  // verification). A ref updated every render, dereferenced inside the listener, always calls
  // the latest `onChange` instead.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => view.destroy();
    // Deliberately mount-once for `extensions`/`value`: re-creating the EditorView on every prop
    // change would reset cursor/undo history. `onChange` itself is never stale (see onChangeRef
    // above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External `value` changes (switching cells, an example load, an undo outside this editor) that
  // didn't originate from this editor's own `updateListener` — push them in as a fresh document.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === lastEmitted.current) return;
    lastEmitted.current = value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  return <div ref={hostRef} className={className} />;
}
