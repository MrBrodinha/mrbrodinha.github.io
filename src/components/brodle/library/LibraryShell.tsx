import type { ReactNode } from 'react';
import '../Brodle.css';
import './MelodyLibrary.css';

export default function LibraryShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <div className="brodle-page library-page"><main className="brodle-content brodle-main">
    <header className="brodle-header"><div className="brodle-brand"><div><h1>{title}</h1><p>{intro}</p></div></div></header><div className="brodle-workspace">{children}</div>
  </main></div>;
}
