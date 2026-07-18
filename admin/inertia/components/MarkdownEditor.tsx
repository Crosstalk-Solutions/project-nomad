import { useEffect, useRef } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup } from 'codemirror'
import { useTheme } from '~/hooks/useTheme'

interface MarkdownEditorProps {
  /** Initial document contents. Read once on mount; later edits are reported via onChange. */
  initialValue: string
  onChange: (value: string) => void
  className?: string
}

/**
 * A thin React wrapper that mounts a CodeMirror 6 editor tuned for Markdown.
 * The editor is uncontrolled after mount (its state lives in CodeMirror); the
 * current value is surfaced to the parent through onChange. The one-dark theme
 * is applied via a Compartment so light/dark toggles reconfigure in place
 * without rebuilding the document.
 */
export default function MarkdownEditor({ initialValue, onChange, className }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const { theme } = useTheme()

  useEffect(() => {
    if (!hostRef.current) return

    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        // Fill the host element and scroll internally rather than growing the page.
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
        themeCompartment.current.of(theme === 'dark' ? oneDark : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
      ],
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Mount once; initialValue/theme changes are handled below or by remounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(theme === 'dark' ? oneDark : []),
    })
  }, [theme])

  return <div ref={hostRef} className={className} />
}
