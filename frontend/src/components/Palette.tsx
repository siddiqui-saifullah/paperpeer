import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../context/session';
import { api } from '../lib/api';
import { toggleTheme } from '../lib/theme';
import type { Exam } from '../lib/types';
import { Icon, type IconName } from './Icon';
import { navItems } from './nav';

interface Entry {
  group: string;
  label: string;
  icon: IconName;
  hint?: string;
  run(): void;
}

const go = (hash: string) => () => {
  location.hash = hash;
};

// Ctrl/Cmd+K command menu: jump to any page or exam, or run an action.
export function Palette({ onClose }: { onClose(): void }) {
  const { isStaff, logout } = useSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);

  useEffect(() => {
    dialog.current?.showModal();
    api<{ exams: Exam[] }>('/exams').then((r) => setExams(r.exams), () => {});
  }, []);

  const all = useMemo<Entry[]>(
    () => [
      ...navItems(isStaff).map((n) => ({ group: 'Navigate', label: n.label, icon: n.icon, run: go(n.href) })),
      { group: 'Navigate', label: 'Settings', icon: 'settings', run: go('#/account') },
      ...(isStaff
        ? [
            { group: 'Actions', label: 'Create new exam', icon: 'plus' as const, hint: 'Exam', run: go('#/exams/new') },
            { group: 'Actions', label: 'Add students', icon: 'people' as const, run: go('#/people') },
          ]
        : []),
      { group: 'Actions', label: 'Toggle dark mode', icon: 'moon', run: toggleTheme },
      { group: 'Actions', label: 'Log out', icon: 'logout', run: () => void logout() },
      ...exams.map((e) => ({ group: 'Exams', label: e.title, hint: `${e.subject} · ${e.className}`, icon: 'exams' as const, run: go(`#/exams/${e.id}`) })),
    ],
    [exams, isStaff, logout],
  );

  const q = query.trim().toLowerCase();
  const shown = all.filter((e) => !q || `${e.label} ${e.hint || ''}`.toLowerCase().includes(q)).slice(0, 40);
  const selected = Math.min(sel, Math.max(shown.length - 1, 0));

  const close = () => {
    dialog.current?.close();
    onClose();
  };
  const choose = (i: number) => {
    const item = shown[i];
    if (!item) return;
    close();
    item.run();
  };

  return (
    <dialog
      ref={dialog}
      className="palette"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
    >
      <div className="p-search">
        <Icon name="search" />
        <input
          type="text"
          placeholder="Search exams, pages and actions…"
          aria-label="Search"
          autoComplete="off"
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setSel(Math.min(selected + 1, shown.length - 1));
            else if (e.key === 'ArrowUp') setSel(Math.max(selected - 1, 0));
            else if (e.key === 'Enter') choose(selected);
            else return;
            e.preventDefault();
          }}
        />
      </div>
      <div className="p-results" role="listbox">
        {shown.length ? (
          shown.map((e, i) => (
            <div key={`${e.group}-${e.label}-${i}`}>
              {(i === 0 || shown[i - 1]!.group !== e.group) && <div className="p-group">{e.group}</div>}
              <div
                className={`p-item ${i === selected ? 'sel' : ''}`}
                role="option"
                aria-selected={i === selected}
                ref={(el) => {
                  if (i === selected) el?.scrollIntoView({ block: 'nearest' });
                }}
                onClick={() => choose(i)}
              >
                <Icon name={e.icon} />
                <span>{e.label}</span>
                {e.hint && <span className="hint">{e.hint}</span>}
              </div>
            </div>
          ))
        ) : (
          <p className="muted small p-none">No results for "{query}".</p>
        )}
      </div>
      <div className="p-foot">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> move
        </span>
        <span>
          <kbd>Enter</kbd> open
        </span>
        <span>
          <kbd>Esc</kbd> close
        </span>
      </div>
    </dialog>
  );
}
