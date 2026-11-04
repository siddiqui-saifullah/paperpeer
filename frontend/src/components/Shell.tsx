import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMe, useSession } from '../context/session';
import { useTheme } from '../hooks/useTheme';
import { toggleTheme } from '../lib/theme';
import { Icon } from './Icon';
import { Avatar } from './kit';
import { navItems, type NavKey } from './nav';
import { Palette } from './Palette';
import { Brand } from './Wordmark';

const ROLE_LABEL = { admin: 'Administrator', teacher: 'Teacher', student: 'Student' } as const;

/** [label, href] for each breadcrumb before the page title. */
export type Crumb = [string, string];

interface Props {
  active: NavKey | '';
  title: string;
  crumbs?: Crumb[];
  children: ReactNode;
}

// The app frame: sidebar, top bar with breadcrumbs, then the page itself.
export function Shell({ active, title, crumbs = [], children }: Props) {
  const me = useMe();
  const { isStaff } = useSession();
  const theme = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const meButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.title = title ? `${title} · PaperPeer` : 'PaperPeer';
  }, [title]);

  // Navigating closes the mobile menu and the user menu.
  useEffect(() => {
    const close = () => {
      setNavOpen(false);
      setMenu(false);
    };
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen);
    return () => document.body.classList.remove('nav-open');
  }, [navOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const trail: [string, string?][] = [...crumbs, [title || 'Home']];

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Main">
        <Brand />
        <div className="workspace">
          <Avatar name={me.school.name} size="sm" square />
          <div className="grow">
            <div className="ws-name">{me.school.name}</div>
            <div className="ws-sub">Workspace · {me.school.code}</div>
          </div>
        </div>
        <button className="sb-search" type="button" onClick={() => setPalette(true)}>
          <Icon name="search" />
          <span className="grow">Search</span>
          <kbd>Ctrl K</kbd>
        </button>
        <nav className="sb-nav">
          <p className="sb-label">{isStaff ? 'Workspace' : 'Learning'}</p>
          {navItems(isStaff).map((n) => (
            <a key={n.key} className={`nav-item ${active === n.key ? 'active' : ''}`} href={n.href} aria-current={active === n.key ? 'page' : undefined}>
              <Icon name={n.icon} />
              {n.label}
              {n.isNew && <span className="tag-new">New</span>}
            </a>
          ))}
          <p className="sb-label">Account</p>
          <a className={`nav-item ${active === 'account' ? 'active' : ''}`} href="#/account">
            <Icon name="settings" />
            Settings
          </a>
        </nav>
        <div className="sb-foot">
          <button className="me-row" type="button" ref={meButton} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <Avatar name={me.name} />
            <div className="who grow">
              <b>{me.name}</b>
              <span>{ROLE_LABEL[me.role]}</span>
            </div>
            <Icon name="down" />
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <div className="main">
        <header className="topbar no-print">
          <button className="icon-btn menu-toggle" type="button" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            <Icon name="menu" />
          </button>
          <nav className="crumbs" aria-label="Breadcrumb">
            {trail.map(([label, href], i) => {
              const middle = i < trail.length - 1 ? 'crumb-mid' : '';
              return (
                <Fragment key={i}>
                  {i > 0 && <span className={`sep ${middle}`}>/</span>}
                  {href ? (
                    <a className={middle} href={href}>
                      {label}
                    </a>
                  ) : (
                    <span className="here">{label}</span>
                  )}
                </Fragment>
              );
            })}
          </nav>
          <span className="spacer" />
          <button className="icon-btn" type="button" aria-label="Search" onClick={() => setPalette(true)}>
            <Icon name="search" />
          </button>
          <button className="icon-btn" type="button" aria-label="Toggle dark mode" onClick={toggleTheme}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </header>
        <main className="page" tabIndex={-1}>
          {children}
        </main>
      </div>
      {palette && <Palette onClose={() => setPalette(false)} />}
      {menu && meButton.current && <UserMenu anchor={meButton.current} onClose={() => setMenu(false)} onPalette={() => setPalette(true)} />}
    </div>
  );
}

function UserMenu({ anchor, onClose, onPalette }: { anchor: HTMLElement; onClose(): void; onPalette(): void }) {
  const me = useMe();
  const { logout } = useSession();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [anchor, onClose]);

  // Positioned above the button it opens from, via the CSSOM (allowed by the CSP).
  const place = (el: HTMLDivElement | null) => {
    ref.current = el;
    if (!el) return;
    const box = anchor.getBoundingClientRect();
    el.style.left = `${box.left}px`;
    el.style.bottom = `${innerHeight - box.top + 6}px`;
    el.style.width = `${box.width}px`;
  };

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return createPortal(
    <div className="popover" role="menu" ref={place}>
      <div className="pop-head">
        <b>{me.name}</b>
        <span>
          @{me.username} · {me.school.name}
        </span>
      </div>
      <a href="#/account" role="menuitem" onClick={onClose}>
        <Icon name="settings" />
        Account settings
      </a>
      <button type="button" role="menuitem" onClick={run(toggleTheme)}>
        <Icon name="moon" />
        Toggle theme
      </button>
      <button type="button" role="menuitem" onClick={run(onPalette)}>
        <Icon name="search" />
        Command menu
      </button>
      <button type="button" role="menuitem" onClick={run(() => void logout())}>
        <Icon name="logout" />
        Log out
      </button>
    </div>,
    document.body,
  );
}
