import { useEffect, useRef } from 'react';
import type { CodeRange } from './sheetEditorCode';

type Props = {
  blocked?: boolean;
  value: string;
  dirty: boolean;
  error: string;
  range: CodeRange | null;
  selectionVersion?: number;
  linkMissing: boolean;
  onChange: (text: string) => void;
  onApply: () => void;
  onReset: () => void;
};
export default function SheetCodeEditor({
  blocked = false,
  value,
  dirty,
  error,
  range,
  selectionVersion = 0,
  linkMissing,
  onChange,
  onApply,
  onReset,
}: Props) {
  const field = useRef<HTMLTextAreaElement>(null),
    numbers = useRef<HTMLDivElement>(null),
    band = useRef<HTMLDivElement>(null);
  const count = value.split('\n').length;
  const startLine = range?.startLine,
    endLine = range?.endLine;
  function syncScroll() {
    const top = field.current?.scrollTop ?? 0;
    if (numbers.current) numbers.current.style.transform = `translateY(-${top}px)`;
    if (band.current) band.current.style.transform = `translateY(-${top}px)`;
  }
  useEffect(() => {
    const node = field.current;
    if (node && startLine && endLine && !node.matches(':focus')) {
      const top = 12 + (startLine - 1) * 20,
        bottom = 12 + endLine * 20;
      if (top < node.scrollTop) node.scrollTop = Math.max(0, top - 12);
      else if (bottom > node.scrollTop + node.clientHeight)
        node.scrollTop = Math.max(0, bottom - node.clientHeight + 12);
    }
    syncScroll();
  }, [value, startLine, endLine, selectionVersion]);
  return (
    <section className="sheet-editor-code" aria-labelledby="sheet-code-title">
      <h2 id="sheet-code-title">Melody code</h2>
      <p>
        Edit the code, then Apply to update your sketch. Select a note or rest to find its line.
      </p>
      <div
        className="sheet-code-editor"
        data-invalid={Boolean(error)}
        style={{ gridTemplateColumns: `${String(count).length + 3}ch minmax(0,1fr)` }}
      >
        <div className="sheet-code-gutter" aria-hidden="true">
          <div ref={numbers} className="sheet-code-line-list">
            {Array.from({ length: count }, (_, index) => (
              <span
                key={index}
                data-line={index + 1}
                className={
                  range && index + 1 >= range.startLine && index + 1 <= range.endLine
                    ? 'active'
                    : ''
                }
              >
                {index + 1}
              </span>
            ))}
          </div>
        </div>
        <div className="sheet-code-text-wrap">
          {range && (
            <div
              ref={band}
              className="sheet-code-line-highlight"
              data-start-line={range.startLine}
              data-end-line={range.endLine}
              style={{
                top: 12 + (range.startLine - 1) * 20,
                height: (range.endLine - range.startLine + 1) * 20,
              }}
              aria-hidden="true"
            />
          )}
          <textarea
            disabled={blocked}
            ref={field}
            aria-label="Generated melody code"
            aria-describedby="sheet-code-help"
            aria-invalid={Boolean(error)}
            spellCheck={false}
            wrap="off"
            value={value}
            rows={Math.min(14, Math.max(8, count))}
            onChange={(event) => onChange(event.target.value)}
            onScroll={syncScroll}
          />
        </div>
      </div>
      <div className="sheet-editor-history sheet-code-actions">
        <button type="button" disabled={!dirty || blocked} onClick={onApply}>
          Apply code
        </button>
        <button type="button" disabled={!dirty || blocked} onClick={onReset}>
          Reset code to score
        </button>
      </div>
      <p id="sheet-code-help" role="status">
        {dirty
          ? 'Unapplied code: Apply or reset it before changing or playing the score.'
          : 'Code matches the committed score.'}{' '}
        {range
          ? `Selected code ${range.startLine === range.endLine ? 'line' : 'lines'} ${range.startLine}${range.startLine !== range.endLine ? `–${range.endLine}` : ''}.`
          : linkMissing
            ? 'Apply or reset code to link this changed event.'
            : ''}
      </p>
      {error && (
        <p role="alert" className="sheet-editor-code-error">
          {error} The score has not changed.
        </p>
      )}
    </section>
  );
}
