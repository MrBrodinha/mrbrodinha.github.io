import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import BrodleIcon from './BrodleIcon';
import BrodleNavigation from './BrodleNavigation';

export default function BrodleSideMenu({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const sidebar = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (sidebar.current) sidebar.current.inert = !open;
    if (!open) return;
    closeButton.current?.focus({ preventScroll: true });
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  return <aside ref={sidebar} id={id} className="brodle-navigation-sidebar" aria-label="Brodle navigation" aria-hidden={!open}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    }}
    onClick={(event) => {
      if (!event.defaultPrevented && (event.target as Element).closest('a[href]')) onClose();
    }}>
    <div className="brodle-page brodle-sidebar-inner">
      <div className="brodle-menu-heading">
        <h2>Brodle menu</h2>
        <button ref={closeButton} type="button" className="brodle-button ghost-button" aria-label="Close menu" onClick={onClose}><BrodleIcon name="close" size={20} /></button>
      </div>
      <Link to="/" className="brodle-menu-back"><span aria-hidden="true">←</span>MrBrodinha</Link>
      <section className="brodle-menu-section" aria-label="Navigation">
        <h3>Explore</h3>
        <BrodleNavigation />
      </section>
    </div>
  </aside>;
}
