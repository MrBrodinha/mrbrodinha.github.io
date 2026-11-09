import { useRef, useState } from 'react';
import { exportMelodyCode } from '../creator/melodyComposer';
import type { ComposerDraft } from '../creator/melodyComposer';
import BrodleIcon from '../components/BrodleIcon';

export default function MelodyCodePreview({ draft, title }: { draft: ComposerDraft; title: string }) {
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const source = useRef<HTMLPreElement>(null);
  const code = open ? exportMelodyCode(draft) : '';

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus('Copied!');
    } catch {
      if (source.current) {
        source.current.focus();
        const range = document.createRange();
        range.selectNodeContents(source.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setCopyStatus('Select and copy the code below.');
    }
  }

  return <details className="melody-preview melody-code-preview" onToggle={(event) => { setOpen(event.currentTarget.open); setCopyStatus(''); }}>
    <summary>View melody code</summary>
    {open && <>
      <p className="library-muted">Use line numbers or copy a snippet into your review note so the creator can correct their melody in Studio. Includes the challenge and any victory parts.</p>
      <div className="melody-code-actions">
        <button type="button" className="library-button" onClick={() => void copyCode()}><BrodleIcon name={copyStatus === 'Copied!' ? 'check' : 'copy'} />Copy code</button>
        <span className="library-muted" role="status">{copyStatus}</span>
      </div>
      <pre ref={source} className="melody-code-source" tabIndex={0} aria-label={'Melody code: ' + title}><code>{code.split('\n').map((line, index, lines) => <span className="melody-code-line" data-line={index + 1} key={index}>{line || ' '}{index < lines.length - 1 ? '\n' : ''}</span>)}</code></pre>
    </>}
  </details>;
}
