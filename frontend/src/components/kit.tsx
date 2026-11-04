import { useEffect, type ReactNode } from 'react';
import type { Mistake, StaffExam } from '../lib/types';
import { Icon, type IconName } from './Icon';

// Small, shared building blocks so every page looks like the same product.

const hash = (text: string) => [...String(text)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export const initials = (name: string) =>
  String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export function Avatar({ name, size = '', square = false }: { name: string; size?: '' | 'sm' | 'lg'; square?: boolean }) {
  return (
    <span className={`avatar ${size} ${square ? 'sq' : ''} av-${hash(name) % 8}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function SubjectIcon({ subject }: { subject: string }) {
  return (
    <span className={`subject-icon s-${hash(subject) % 5}`} aria-hidden="true">
      {String(subject).slice(0, 2).toUpperCase()}
    </span>
  );
}

export type Tone = '' | 'good' | 'warn' | 'bad' | 'info' | 'brand' | 'gold';

export function Pill({ children, tone = '', dot = true }: { children: ReactNode; tone?: Tone; dot?: boolean }) {
  return <span className={`pill ${tone} ${dot ? '' : 'no-dot'}`}>{children}</span>;
}

// One scale for every score in the app, so a colour always means the same thing:
// 70%+ is on track (green), 50–69% needs work (amber), below 50% is a priority (red).
export const toneFor = (pct: number | null | undefined): Tone =>
  pct === null || pct === undefined ? '' : pct >= 70 ? 'good' : pct >= 50 ? 'warn' : 'bad';

export const masteryLevel = (pct: number) => (pct >= 85 ? 'Mastered' : pct >= 70 ? 'Secure' : pct >= 50 ? 'Needs work' : 'Priority');

export function Bar({ value, max, tone = '' }: { value: number; max: number; tone?: Tone }) {
  return <progress className={`bar ${tone}`} max={max || 1} value={value} />;
}

export function BarCell({ value, max, label, tone = '' }: { value: number; max: number; label: ReactNode; tone?: Tone }) {
  return (
    <div className="bar-cell">
      <Bar value={value} max={max} tone={tone} />
      <span>{label}</span>
    </div>
  );
}

/** A score ring. Geometry lives in SVG attributes because the CSP forbids inline styles. */
export function Ring({ pct, caption = '' }: { pct: number | null; caption?: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <svg className={`ring ${toneFor(pct)}`} viewBox="0 0 112 112" role="img" aria-label={`${shown}%`}>
      <circle className="track" cx="56" cy="56" r={r} fill="none" strokeWidth="9" />
      <circle className="value" cx="56" cy="56" r={r} fill="none" strokeWidth="9" strokeDasharray={`${((shown / 100) * c).toFixed(1)} ${c.toFixed(1)}`} />
      <text x="56" y={caption ? 58 : 64} textAnchor="middle">
        {pct === null ? '–' : `${shown}%`}
      </text>
      {caption && (
        <text className="sub" x="56" y="74" textAnchor="middle">
          {caption}
        </text>
      )}
    </svg>
  );
}

interface KpiProps {
  label: string;
  value: ReactNode;
  unit?: string;
  foot?: string;
  footTone?: '' | 'up' | 'down';
  icon?: IconName;
  /** The value is a word or phrase (a topic name), shown smaller than a number. */
  text?: boolean;
}

export function Kpi({ label, value, unit, foot, footTone = '', icon, text = false }: KpiProps) {
  return (
    <div className="card kpi">
      <div className="label">
        {icon && <Icon name={icon} />}
        {label}
      </div>
      <div className={`value ${text ? 'text' : ''}`} title={text ? String(value) : undefined}>
        {value}
        {unit && <small> {unit}</small>}
      </div>
      {foot && <div className={`foot ${footTone}`}>{foot}</div>}
    </div>
  );
}

interface HeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, sub, meta, actions }: HeaderProps) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
        {meta && <div className="meta">{meta}</div>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function MetaItem({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span>
      <Icon name={icon} />
      {children}
    </span>
  );
}

export function Empty({ icon = 'inbox', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon">
        <Icon name={icon} />
      </div>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Callout({ tone, icon, title, children }: { tone: Tone; icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className={`callout ${tone}`}>
      <Icon name={icon} />
      <div>
        <b>{title}</b>
        {children && <span className="muted">{children}</span>}
      </div>
    </div>
  );
}

export const MISTAKES: Record<Mistake, { label: string; hint: string }> = {
  concept: { label: 'Concept gap', hint: 'Did not understand the idea' },
  calculation: { label: 'Calculation slip', hint: 'Right method, wrong arithmetic' },
  misread: { label: 'Misread question', hint: 'Answered something else' },
  incomplete: { label: 'Incomplete working', hint: 'Steps or reasoning missing' },
  unattempted: { label: 'Not attempted', hint: 'Left blank or ran out of time' },
};
export const MISTAKE_KEYS = Object.keys(MISTAKES) as Mistake[];

export function MistakeTag({ mistake }: { mistake: Mistake | null }) {
  if (!mistake) return null;
  return (
    <span className={`mistake m-${mistake}`}>
      <i />
      {MISTAKES[mistake].label}
    </span>
  );
}

/** Where an exam is in its life, for staff. */
export function staffStage(e: Pick<StaffExam, 'status' | 'submitted' | 'graded' | 'marksReleased'>): { key: string; label: string; tone: Tone } {
  if (e.status === 'draft') return { key: 'draft', label: 'Draft', tone: '' };
  if (e.status === 'collecting') return { key: 'collecting', label: 'Collecting', tone: 'info' };
  if (e.submitted > e.graded) return { key: 'marking', label: 'Marking', tone: 'warn' };
  if (!e.marksReleased) return { key: 'ready', label: 'Ready to release', tone: 'brand' };
  return { key: 'released', label: 'Released', tone: 'good' };
}

/** A topic with its score: name and % on one line, a bar, and one quiet detail line. */
export function TopicRow({ title, pct, detail }: { title: string; pct: number; detail?: string }) {
  return (
    <div className="topic-row">
      <div className="row between">
        <b>{title}</b>
        <span className={`num ${toneFor(pct)}`}>{pct}%</span>
      </div>
      <Bar value={pct} max={100} tone={toneFor(pct)} />
      {detail && <div className="tiny muted">{detail}</div>}
    </div>
  );
}

/** While mounted, shows the thin progress bar at the top of the page. */
export function Loading() {
  useEffect(() => {
    document.body.classList.add('loading');
    return () => document.body.classList.remove('loading');
  }, []);
  return null;
}
