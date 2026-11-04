import { useId } from 'react';
import { Icon } from './Icon';

// Editable list of questions (label, topic, marks) with a running total.
// Used when creating an exam and on the exam's Questions tab.

export interface QuestionDraft {
  label: string;
  topic: string;
  /** As typed, so an empty field stays empty. */
  maxMarks: string;
}

export const toDrafts = (qs: { label: string; topic: string; maxMarks: number }[]): QuestionDraft[] =>
  qs.map((q) => ({ label: q.label, topic: q.topic, maxMarks: String(q.maxMarks) }));

export const draftTotal = (qs: QuestionDraft[]) => Math.round(qs.reduce((n, q) => n + (Number(q.maxMarks) || 0), 0) * 100) / 100;

interface Props {
  value: QuestionDraft[];
  onChange(next: QuestionDraft[]): void;
  locked?: boolean;
}

export function QuestionBuilder({ value, onChange, locked = false }: Props) {
  const listId = useId();
  const topics = [...new Set(value.map((q) => q.topic.trim()).filter(Boolean))];

  const update = (i: number, field: keyof QuestionDraft, text: string) => onChange(value.map((q, j) => (j === i ? { ...q, [field]: text } : q)));

  const add = () => {
    const last = value.at(-1);
    onChange([...value, { label: `Q${value.length + 1}`, topic: '', maxMarks: last?.maxMarks || '' }]);
    // Focus the new row's topic once React has drawn it.
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-qb="${listId}"] .qb-row:last-child [data-f=topic]`)?.focus());
  };

  return (
    <div className="qbuilder">
      <div className="qb-row qb-head">
        <span>Label</span>
        <span>Topic</span>
        <span>Marks</span>
        <span />
      </div>
      <div className="stack tight" data-qb={listId}>
        {value.map((q, i) => (
          <div className="qb-row" key={i}>
            <input type="text" className="input-sm" value={q.label} maxLength={40} aria-label="Question label" disabled={locked} onChange={(e) => update(i, 'label', e.target.value)} />
            <input
              type="text"
              className="input-sm"
              data-f="topic"
              value={q.topic}
              maxLength={60}
              placeholder="Topic, e.g. Quadratic equations"
              aria-label="Topic"
              list={listId}
              disabled={locked}
              onChange={(e) => update(i, 'topic', e.target.value)}
            />
            <input
              type="number"
              className="input-sm"
              value={q.maxMarks}
              min="0.5"
              step="any"
              inputMode="decimal"
              placeholder="Marks"
              aria-label="Marks"
              disabled={locked}
              onChange={(e) => update(i, 'maxMarks', e.target.value)}
            />
            <button className="icon-btn" type="button" aria-label="Remove question" disabled={locked} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Icon name="x" />
            </button>
          </div>
        ))}
      </div>
      {!locked && (
        <div>
          <button className="btn sm" type="button" onClick={add}>
            <Icon name="plus" />
            Add question
          </button>
        </div>
      )}
      <div className="qb-total">
        <span className="muted">Total marks</span>
        <b className="num">{draftTotal(value)}</b>
      </div>
      {/* Topics typed so far become suggestions for the next rows. */}
      <datalist id={listId}>
        {topics.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}

/** What the API takes, or an error message to show. */
export function checkDrafts(qs: QuestionDraft[]): { label: string; topic: string; maxMarks: number }[] {
  if (!qs.length) throw new Error('Add at least one question, or turn off marking by question.');
  if (qs.some((q) => !(Number(q.maxMarks) > 0))) throw new Error('Give every question its marks.');
  return qs.map((q) => ({ label: q.label.trim(), topic: q.topic.trim(), maxMarks: Number(q.maxMarks) }));
}
