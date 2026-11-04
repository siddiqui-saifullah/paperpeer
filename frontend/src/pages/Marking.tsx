import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Dropzone, FileList, useFileDelete, Viewer } from '../components/Files';
import { Form, FormError, Submit } from '../components/Form';
import { Icon } from '../components/Icon';
import { Avatar, Bar, MISTAKE_KEYS, MISTAKES } from '../components/kit';
import { Page } from '../components/Page';
import { useToast } from '../context/toast';
import { useApi } from '../hooks/useApi';
import { api, uploadFiles } from '../lib/api';
import type { MarkingView, Mistake } from '../lib/types';

const QUICK_FEEDBACK = ['Excellent work.', 'Show all your steps.', 'Check your calculation.', 'Read the question carefully.', 'Revise this chapter.'];

interface Score {
  marks: string;
  mistake: Mistake | null;
}

function Grader({ view, reload }: { view: MarkingView; reload(): Promise<void> }) {
  const { exam, submission: s, nextId, total, marked } = view;
  const toast = useToast();
  const removeFile = useFileDelete(reload);
  const byQuestion = s.breakdown.length > 0;
  const [scores, setScores] = useState<Score[]>(() => s.breakdown.map((q) => ({ marks: q.marks === null ? '' : String(q.marks), mistake: q.mistake })));
  const [feedback, setFeedback] = useState(s.feedback);
  const markInputs = useRef<(HTMLInputElement | null)[]>([]);
  const feedbackBox = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    markInputs.current[0]?.focus();
  }, []);

  const sum = Math.round(scores.reduce((n, q) => n + (Number(q.marks) || 0), 0) * 100) / 100;
  const complete = scores.every((q) => q.marks !== '');
  const shownTotal = byQuestion ? (complete ? sum : `${sum}…`) : (s.marks ?? '–');
  const setScore = (i: number, patch: Partial<Score>) => setScores((list) => list.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  return (
    <>
      <div className="page-header">
        <div className="row nowrap">
          <Avatar name={s.studentName} size="lg" />
          <div>
            <p className="eyebrow">Marking · {exam.title}</p>
            <h1>{s.studentName}</h1>
            <p className="sub">
              {s.rollNo ? `Roll ${s.rollNo} · ` : ''}
              {marked} of {total} answers marked
            </p>
          </div>
        </div>
        <div className="row">
          <div className="hide-sm">
            <Bar value={marked} max={total} tone="good" />
          </div>
          <a className="btn" href={`#/exams/${exam.id}`}>
            <Icon name="back" />
            Back to exam
          </a>
        </div>
      </div>
      <div className="workspace-split">
        <section className="stack">{s.files.length ? <Viewer files={s.files} /> : <div className="card pad muted">No pages uploaded.</div>}</section>
        <Form
          className="card grader"
          onSubmit={async (data) => {
            const body: Record<string, unknown> = { feedback, isModel: !!data.isModel, hiddenFromPeers: !!data.hiddenFromPeers };
            if (byQuestion) body.scores = s.breakdown.map((q, i) => ({ questionId: q.id, marks: scores[i]!.marks, mistake: scores[i]!.mistake }));
            else body.marks = data.marks;
            await api(`/submissions/${s.id}`, { method: 'PATCH', body });
            toast('Saved.');
            location.hash = nextId ? `#/submissions/${nextId}` : `#/exams/${exam.id}`;
          }}
        >
          <div className="total">
            <div>
              <div className="small muted">Total score</div>
              <div className="big">
                <span>{shownTotal}</span> <small>/ {exam.maxMarks}</small>
              </div>
            </div>
            {s.isModel && <span className="pill gold">★ Best answer</span>}
          </div>
          <div className="scroll">
            {byQuestion ? (
              <div className="stack tight">
                <p className="tiny muted">Score each question. If marks were lost, tag why. It builds the Mistake Map and this student’s Peer Bridge.</p>
                {s.breakdown.map((q, i) => {
                  const score = scores[i]!;
                  const full = score.marks !== '' && Number(score.marks) >= q.maxMarks;
                  return (
                    <div className={`qrow ${full ? 'full' : ''}`} key={q.id}>
                      <div className="qhead">
                        <div>
                          <b>{q.label}</b>
                          {q.topic && <span> · {q.topic}</span>}
                        </div>
                        <input
                          ref={(el) => {
                            markInputs.current[i] = el;
                          }}
                          className="marks-input"
                          type="number"
                          min="0"
                          max={q.maxMarks}
                          step="any"
                          inputMode="decimal"
                          value={score.marks}
                          aria-label={`Marks for ${q.label}`}
                          onChange={(e) => setScore(i, { marks: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            (markInputs.current[i + 1] ?? feedbackBox.current)?.focus();
                          }}
                        />
                        <span className="qmax">/ {q.maxMarks}</span>
                      </div>
                      <div className="mistake-picker" role="radiogroup" aria-label={`Mistake in ${q.label}`}>
                        {MISTAKE_KEYS.map((key) => (
                          <label key={key} title={MISTAKES[key].hint}>
                            <input type="radio" name={`mistake-${q.id}`} value={key} checked={score.mistake === key} onChange={() => setScore(i, { mistake: key })} />
                            <span className={`m-${key}`}>{MISTAKES[key].label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <label className="field">
                Marks out of {exam.maxMarks}
                <input className="marks-big" type="number" name="marks" min="0" max={exam.maxMarks} step="any" inputMode="decimal" defaultValue={s.marks ?? ''} autoFocus />
              </label>
            )}
            <label className="field">
              Feedback <small>Only this student sees it</small>
              <textarea ref={feedbackBox} maxLength={5000} placeholder="What went well, and one thing to work on" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            </label>
            <div className="chips">
              {QUICK_FEEDBACK.map((text) => (
                <button className="chip" type="button" key={text} onClick={() => setFeedback((f) => (f ? `${f} ${text}` : text))}>
                  {text}
                </button>
              ))}
            </div>
            <label className="switch">
              <div>
                <b>Best answer</b>
                <span>Shown first to classmates as a model</span>
              </div>
              <input type="checkbox" name="isModel" defaultChecked={s.isModel} />
            </label>
            <details className="more">
              <summary>
                <Icon name="settings" /> More options
              </summary>
              <label className="switch">
                <div>
                  <b>Hide from classmates</b>
                  <span>For example, if a name is written on the sheet</span>
                </div>
                <input type="checkbox" name="hiddenFromPeers" defaultChecked={s.hiddenFromPeers} />
              </label>
              <p className="small muted gap-below gap-above">Pages</p>
              <FileList files={s.files} onRemove={removeFile} />
              <Dropzone label="Add more pages" upload={(files, progress) => uploadFiles(`/exams/${exam.id}/students/${s.studentId}/submission`, files, progress)} done={reload} />
            </details>
            <FormError />
          </div>
          <div className="card-foot row between">
            <span className="tiny muted">
              <kbd>Enter</kbd> next field
            </span>
            <Submit>
              {nextId ? 'Save & next' : 'Save & finish'}
              <Icon name="arrow" />
            </Submit>
          </div>
        </Form>
      </div>
    </>
  );
}

export function MarkingPage() {
  const { id } = useParams();
  const load = useApi<MarkingView>(`/submissions/${id}`);
  return (
    <Page
      load={load}
      active="exams"
      title={(v) => v.submission.studentName}
      crumbs={(v) => [
        ['Exams', '#/exams'],
        [v.exam.title, `#/exams/${v.exam.id}`],
      ]}
    >
      {(view) => <Grader key={view.submission.id} view={view} reload={load.reload} />}
    </Page>
  );
}
