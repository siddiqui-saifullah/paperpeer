import { useState, type ReactNode } from 'react';
import { Dropzone, FileList, useFileDelete } from '../components/Files';
import { Form, FormError, Submit } from '../components/Form';
import { Icon, type IconName } from '../components/Icon';
import { Avatar, Callout, Empty, Kpi, MetaItem, PageHeader, Pill, toneFor } from '../components/kit';
import { InsightList, MistakeMatrix, QuestionChart, reteach } from '../components/MistakeMap';
import { Modal } from '../components/Modal';
import { QuestionBuilder, toDrafts, type QuestionDraft } from '../components/QuestionBuilder';
import { useConfirm } from '../context/confirm';
import { useToast } from '../context/toast';
import { useAct } from '../hooks/useAct';
import { api, uploadFiles } from '../lib/api';
import { formatDate, pct } from '../lib/format';
import { ACCEPT, preparePhotos } from '../lib/photos';
import type { Exam, QuestionInsight, RosterEntry, StaffExamDetail } from '../lib/types';

type Tab = 'answers' | 'map' | 'questions' | 'files' | 'settings';
type StepAction = 'files' | 'publish' | 'skip' | 'close' | 'mark' | 'share';

interface Step {
  title: string;
  text: string;
  action?: StepAction;
  label?: string;
  alt?: StepAction;
  altLabel?: string;
  progress?: [number, number];
  target?: string;
  done?: boolean;
}

/** The one thing to do next on this exam. */
function nextStep(exam: Exam, paperCount: number, roster: RosterEntry[]): Step {
  const answers = roster.filter((r) => r.submission);
  const left = answers.filter((r) => r.submission!.marks === null);
  if (exam.status === 'draft' && !paperCount) {
    return { title: 'Add the question paper', text: 'Students cannot see this exam yet.', action: 'files', label: 'Add question paper' };
  }
  if (exam.status === 'draft') {
    return {
      title: 'Ready to publish',
      text: 'Students will see the paper and can upload answers from their phone.',
      action: 'publish',
      label: 'Publish to students',
      alt: 'skip',
      altLabel: 'I’ll upload the sheets myself',
    };
  }
  if (exam.status === 'collecting') {
    return {
      title: `${answers.length} of ${roster.length} students have handed in`,
      text: 'When everyone is done, close hand-in to start marking.',
      action: 'close',
      label: 'Close hand-in',
      progress: [answers.length, roster.length],
    };
  }
  if (!answers.length) return { title: 'No answers yet', text: 'Upload sheets for students below, or reopen hand-in in Settings.' };
  if (left.length) {
    return {
      title: `${left.length} of ${answers.length} answers left to mark`,
      text: 'Students cannot see marks until you release them.',
      action: 'mark',
      label: 'Start marking',
      target: left[0]!.submission!.id,
      progress: [answers.length - left.length, answers.length],
    };
  }
  if (!exam.marksReleased) {
    return { title: 'Everything is marked', text: 'Each student sees only their own marks, feedback and Peer Bridge.', action: 'share', label: 'Release marks' };
  }
  return { done: true, title: 'Results are out', text: 'Students can see their marks, the solution and classmates’ answers.' };
}

function stageIndex(exam: Exam, step: Step) {
  if (exam.status === 'draft') return 0;
  if (exam.status === 'collecting') return 1;
  return step.done ? 4 : 2 + (step.action === 'share' ? 1 : 0);
}

const STAGES = [
  ['Draft', 'Paper and questions'],
  ['Hand-in', 'Students upload'],
  ['Marking', 'Score each answer'],
  ['Released', 'Results and peers'],
];

function Pipeline({ current }: { current: number }) {
  return (
    <div className="pipeline">
      {STAGES.map(([title, sub], i) => (
        <div key={title} className={`stage ${i < current ? 'done' : i === current ? 'current' : ''}`}>
          <span className="dot">{i < current ? <Icon name="check" /> : i + 1}</span>
          <div>
            <b>{title}</b>
            {sub}
          </div>
        </div>
      ))}
    </div>
  );
}

function TabButton({ active, icon, label, count, onClick }: { active: boolean; icon: IconName; label: string; count?: ReactNode; onClick(): void }) {
  return (
    <button className={`tab ${active ? 'active' : ''}`} type="button" role="tab" aria-selected={active} onClick={onClick}>
      <Icon name={icon} />
      {label}
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );
}

interface Props {
  data: StaffExamDetail;
  insights: QuestionInsight[];
  reload(): Promise<void>;
}

export function TeacherExam({ data, insights, reload }: Props) {
  const { exam, paper, solution, roster, stats, questions } = data;
  const toast = useToast();
  const confirm = useConfirm();
  const act = useAct(reload);
  const removeFile = useFileDelete(reload);
  const [tab, setTab] = useState<Tab>('answers');
  const [editing, setEditing] = useState(false);

  const step = nextStep(exam, paper.length, roster);
  const answers = roster.filter((r) => r.submission);
  const marked = answers.filter((r) => r.submission!.marks !== null).length;
  const byQuestion = questions.length > 0;
  const scoringStarted = insights.some((q) => q.scored > 0);
  const avgPct = stats.average === null ? null : pct(stats.average, exam.maxMarks);
  const patch = (body: Record<string, unknown>) => api(`/exams/${exam.id}`, { method: 'PATCH', body });

  const runStep = act(async (name: StepAction) => {
    if (name === 'files') return setTab('files');
    if (name === 'mark') {
      location.hash = `#/submissions/${step.target}`;
      return;
    }
    if (name === 'publish') {
      await patch({ status: 'collecting' });
      return 'Published. Students can now hand in.';
    }
    if (name === 'skip') return void (await patch({ status: 'review' }));
    if (name === 'share') {
      await patch({ marksReleased: true });
      return 'Marks released to students.';
    }
    const message = exam.peerSharing
      ? 'Close hand-in? Students will then see the solution and classmates’ answers.'
      : 'Close hand-in? Students will then see the solution.';
    if (await confirm({ message, confirmLabel: 'Close hand-in' })) await patch({ status: 'review' });
  });

  return (
    <>
      <PageHeader
        eyebrow={`${exam.subject} · ${exam.className}`}
        title={exam.title}
        meta={
          <>
            {exam.examDate && <MetaItem icon="calendar">{formatDate(exam.examDate)}</MetaItem>}
            <MetaItem icon="target">{exam.maxMarks} marks</MetaItem>
            {byQuestion && <MetaItem icon="layers">{questions.length} questions</MetaItem>}
            <MetaItem icon={exam.anonymous ? 'lock' : 'eye'}>{exam.anonymous ? 'Names hidden' : 'Names shown'}</MetaItem>
          </>
        }
      />
      <section className="card gap-below">
        <Pipeline current={stageIndex(exam, step)} />
        <div className="next-action">
          <div className="grow">
            <h2>{step.title}</h2>
            <p>{step.text}</p>
            {step.progress && <progress className="bar" max={step.progress[1] || 1} value={step.progress[0]} />}
          </div>
          <div className="row">
            {step.alt && (
              <button className="btn" type="button" onClick={() => void runStep(step.alt!)}>
                {step.altLabel}
              </button>
            )}
            {step.action && (
              <button className="btn primary lg" type="button" onClick={() => void runStep(step.action!)}>
                {step.label}
                <Icon name="arrow" />
              </button>
            )}
            {step.done && <Pill tone="good">Complete</Pill>}
          </div>
        </div>
      </section>
      <div className="kpis">
        <Kpi label="Handed in" value={answers.length} unit={`/ ${roster.length}`} foot={`${pct(answers.length, roster.length)}% of the class`} icon="upload" />
        <Kpi
          label="Marked"
          value={marked}
          unit={`/ ${answers.length}`}
          foot={answers.length === marked ? 'Nothing waiting' : `${answers.length - marked} to go`}
          footTone={answers.length === marked ? 'up' : 'down'}
          icon="pen"
        />
        <Kpi
          label="Class average"
          value={avgPct === null ? '–' : `${avgPct}%`}
          foot={stats.average === null ? 'After marking' : `${stats.average} of ${exam.maxMarks}`}
          footTone={avgPct === null ? '' : toneFor(avgPct) === 'good' ? 'up' : 'down'}
          icon="trend"
        />
        <Kpi label="Highest" value={stats.highest ?? '–'} unit={stats.highest === null ? '' : `/ ${exam.maxMarks}`} foot="Best single answer" icon="star" />
      </div>
      <section className="card">
        <div className="tabs" role="tablist">
          <TabButton active={tab === 'answers'} icon="inbox" label="Answers" count={`${answers.length}/${roster.length}`} onClick={() => setTab('answers')} />
          <TabButton active={tab === 'map'} icon="map" label="Mistake Map" onClick={() => setTab('map')} />
          <TabButton active={tab === 'questions'} icon="layers" label="Questions" count={questions.length || undefined} onClick={() => setTab('questions')} />
          <TabButton active={tab === 'files'} icon="file" label="Paper & solution" onClick={() => setTab('files')} />
          <TabButton active={tab === 'settings'} icon="settings" label="Settings" onClick={() => setTab('settings')} />
        </div>
        {tab === 'answers' && <AnswersTab data={data} byQuestion={byQuestion} reload={reload} />}
        {tab === 'map' && <MapTab insights={insights} byQuestion={byQuestion} scoringStarted={scoringStarted} step={step} onQuestions={() => setTab('questions')} />}
        {tab === 'questions' && <QuestionsTab exam={exam} data={data} locked={scoringStarted} reload={reload} />}
        {tab === 'files' && (
          <div className="card-body grid cols-2">
            <section>
              <h3 className="gap-below">Question paper</h3>
              <FileList files={paper} onRemove={removeFile} />
              <Dropzone label="Add question paper" upload={(files, progress) => uploadFiles(`/exams/${exam.id}/files?kind=paper`, files, progress)} done={reload} />
            </section>
            <section>
              <h3 className="gap-below">Solution</h3>
              <FileList files={solution} onRemove={removeFile} />
              <Dropzone label="Add solution" upload={(files, progress) => uploadFiles(`/exams/${exam.id}/files?kind=solution`, files, progress)} done={reload} />
            </section>
          </div>
        )}
        {tab === 'settings' && (
          <div className="card-body">
            <h3>Sharing</h3>
            <Toggle exam={exam} field="peerSharing" title="Classmates can see each other’s answers" text="Only after hand-in closes. Marks and feedback always stay private." act={act} />
            <Toggle
              exam={exam}
              field="anonymous"
              title="Hide student names"
              text="Required for Peer Bridge. A name written on a sheet stays visible, so hide that answer instead."
              act={act}
            />
            <Toggle exam={exam} field="marksReleased" title="Students can see their marks" text="Each student sees only their own result and breakdown." act={act} />
            <h3 className="gap-above">Exam</h3>
            <div className="row gap-above">
              <button className="btn" type="button" onClick={() => setEditing(true)}>
                <Icon name="pen" />
                Edit details
              </button>
              {exam.status === 'review' && (
                <button className="btn" type="button" onClick={act(() => patch({ status: 'collecting' }).then(() => undefined))}>
                  Reopen hand-in
                </button>
              )}
              {exam.status === 'collecting' && (
                <button className="btn" type="button" onClick={act(() => patch({ status: 'draft' }).then(() => undefined))}>
                  Unpublish
                </button>
              )}
              <button
                className="btn danger"
                type="button"
                onClick={async () => {
                  const sure = await confirm({
                    message: `Delete "${exam.title}" with all its files and student answers? This cannot be undone.`,
                    confirmLabel: 'Delete exam',
                    danger: true,
                  });
                  if (!sure) return;
                  try {
                    await api(`/exams/${exam.id}`, { method: 'DELETE' });
                    toast('Exam deleted.');
                    location.hash = '#/exams';
                  } catch (err) {
                    toast((err as Error).message, true);
                  }
                }}
              >
                <Icon name="trash" />
                Delete exam
              </button>
            </div>
          </div>
        )}
      </section>
      {editing && <EditExam exam={exam} byQuestion={byQuestion} onClose={() => setEditing(false)} reload={reload} />}
    </>
  );
}

type Act = ReturnType<typeof useAct>;

function Toggle({ exam, field, title, text, act }: { exam: Exam; field: 'peerSharing' | 'anonymous' | 'marksReleased'; title: string; text: string; act: Act }) {
  return (
    <label className="switch">
      <div>
        <b>{title}</b>
        <span>{text}</span>
      </div>
      <input
        type="checkbox"
        checked={exam[field]}
        onChange={act(async (e: React.ChangeEvent<HTMLInputElement>) => {
          await api(`/exams/${exam.id}`, { method: 'PATCH', body: { [field]: e.target.checked } });
          return 'Saved.';
        })}
      />
    </label>
  );
}

function AnswersTab({ data, byQuestion, reload }: { data: StaffExamDetail; byQuestion: boolean; reload(): Promise<void> }) {
  const { exam, roster } = data;
  const toast = useToast();
  const act = useAct(reload);
  if (!roster.length) {
    return (
      <Empty
        icon="people"
        title="No students in this class"
        action={
          <a className="btn primary" href="#/people">
            Add students
          </a>
        }
      />
    );
  }

  const markIds = roster.flatMap((r) => (r.submission ? [r.submission.id] : []));
  const focusMarks = (id: string | undefined) => id && document.querySelector<HTMLInputElement>(`[data-marks="${id}"]`)?.focus();

  // Marks save as they are typed, and the cursor moves to the next student.
  async function saveMarks(input: HTMLInputElement, id: string) {
    const next = markIds[markIds.indexOf(id) + 1];
    try {
      await api(`/submissions/${id}`, { method: 'PATCH', body: { marks: input.value } });
      await reload();
      focusMarks(next);
    } catch (err) {
      toast((err as Error).message, true);
      input.focus();
    }
  }

  const status = (r: RosterEntry) => {
    if (!r.submission) return <Pill>Not handed in</Pill>;
    if (r.submission.marks === null) return <Pill tone="warn">To mark</Pill>;
    return <Pill tone="good">Marked</Pill>;
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Status</th>
            <th className="hide-sm">Pages</th>
            <th className="right">Marks / {exam.maxMarks}</th>
            <th className="right" />
          </tr>
        </thead>
        <tbody>
          {roster.map((r) => {
            const sub = r.submission;
            return (
              <tr key={r.studentId}>
                <td>
                  <div className="cell-title">
                    <Avatar name={r.name} />
                    <div>
                      <b>
                        {r.name} {sub?.isModel && <span className="pill gold">★ Best answer</span>}
                      </b>
                      <span>{r.rollNo ? `Roll ${r.rollNo}` : 'No roll number'}</span>
                    </div>
                  </div>
                </td>
                <td>{status(r)}</td>
                <td className="hide-sm muted num">{sub ? sub.fileCount : '–'}</td>
                <td className="right">
                  {!sub ? (
                    <span className="faint">–</span>
                  ) : byQuestion ? (
                    <b className="num">{sub.marks ?? <span className="faint">–</span>}</b>
                  ) : (
                    <input
                      key={`${sub.id}-${sub.marks}`}
                      className="marks-input"
                      type="number"
                      min="0"
                      max={exam.maxMarks}
                      step="any"
                      inputMode="decimal"
                      defaultValue={sub.marks ?? ''}
                      data-marks={sub.id}
                      aria-label={`Marks for ${r.name}`}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        const next = markIds[markIds.indexOf(sub.id) + 1];
                        if (next) focusMarks(next);
                        else e.currentTarget.blur();
                      }}
                      onChange={() => {}}
                      onBlur={(e) => {
                        if (e.currentTarget.value !== String(sub.marks ?? '')) void saveMarks(e.currentTarget, sub.id);
                      }}
                    />
                  )}
                </td>
                <td className="right">
                  {sub ? (
                    <a className={`btn sm ${sub.marks === null ? 'primary' : ''}`} href={`#/submissions/${sub.id}`}>
                      {sub.marks === null ? 'Mark' : 'Open'}
                    </a>
                  ) : (
                    <label className="btn sm ghost">
                      <Icon name="upload" />
                      Upload
                      <input
                        className="sr-only"
                        type="file"
                        multiple
                        accept={ACCEPT}
                        onChange={act(async (e: React.ChangeEvent<HTMLInputElement>) => {
                          const files = await preparePhotos(e.target.files ?? []);
                          await uploadFiles(`/exams/${exam.id}/students/${r.studentId}/submission`, files);
                          return 'Uploaded.';
                        })}
                      />
                    </label>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MapTab({ insights, byQuestion, scoringStarted, step, onQuestions }: { insights: QuestionInsight[]; byQuestion: boolean; scoringStarted: boolean; step: Step; onQuestions(): void }) {
  if (!byQuestion) {
    return (
      <Empty
        icon="map"
        title="Split this exam into questions"
        text="Then mark by question to see which questions and which kinds of mistakes cost the class marks."
        action={
          <button className="btn primary" type="button" onClick={onQuestions}>
            Add questions
          </button>
        }
      />
    );
  }
  if (!scoringStarted) {
    return (
      <Empty
        icon="map"
        title="The map fills in as you mark"
        text="Score each question and tag the mistake. The map updates after every answer."
        action={
          step.action === 'mark' ? (
            <a className="btn primary" href={`#/submissions/${step.target}`}>
              Start marking
            </a>
          ) : undefined
        }
      />
    );
  }
  return (
    <div className="card-body stack">
      <div className="grid main-side">
        <div>
          <h3 className="gap-below">Average per question</h3>
          <QuestionChart questions={insights} />
        </div>
        <div>
          <h3 className="gap-below">What to do next</h3>
          <InsightList items={reteach(insights)} />
        </div>
      </div>
      <div>
        <h3 className="gap-below">Mistake Map</h3>
        <MistakeMatrix rows={insights.map((q) => ({ title: q.label, sub: q.topic, scorePct: q.averagePct, total: q.scored, mistakes: q.mistakes }))} />
      </div>
    </div>
  );
}

function QuestionsTab({ exam, data, locked, reload }: { exam: Exam; data: StaffExamDetail; locked: boolean; reload(): Promise<void> }) {
  const confirm = useConfirm();
  const act = useAct(reload);
  const byQuestion = data.questions.length > 0;
  const [drafts, setDrafts] = useState<QuestionDraft[]>(
    byQuestion
      ? toDrafts(data.questions)
      : [
          { label: 'Q1', topic: '', maxMarks: '' },
          { label: 'Q2', topic: '', maxMarks: '' },
        ],
  );
  const save = (list: unknown[]) => api<{ total: number }>(`/exams/${exam.id}/questions`, { method: 'PUT', body: { questions: list } });

  return (
    <div className="card-body stack">
      {locked ? (
        <Callout tone="warn" icon="lock" title="Questions are locked">
          Marking by question has started, so the questions can no longer change.
        </Callout>
      ) : (
        <Callout tone="brand" icon="info" title="Total marks follow the questions">
          Students see each question’s marks and topic in their result breakdown.
        </Callout>
      )}
      <QuestionBuilder value={drafts} onChange={setDrafts} locked={locked} />
      {!locked && (
        <div className="row">
          <button
            className="btn primary"
            type="button"
            onClick={act(async () => {
              if (!drafts.length) throw new Error('Add at least one question.');
              const { total } = await save(drafts);
              return `Questions saved. Total is now ${total} marks.`;
            })}
          >
            Save questions
          </button>
          {byQuestion && (
            <button
              className="btn ghost danger"
              type="button"
              onClick={act(async () => {
                const sure = await confirm({ message: 'Stop marking by question? The questions are removed; the total stays as it is.', confirmLabel: 'Remove questions', danger: true });
                if (!sure) return;
                await save([]);
                setDrafts([]);
                return 'Questions removed.';
              })}
            >
              Stop marking by question
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EditExam({ exam, byQuestion, onClose, reload }: { exam: Exam; byQuestion: boolean; onClose(): void; reload(): Promise<void> }) {
  const toast = useToast();
  return (
    <Modal onClose={onClose}>
      <Form
        className="stack"
        onSubmit={async (data) => {
          await api(`/exams/${exam.id}`, { method: 'PATCH', body: data });
          onClose();
          toast('Saved.');
          await reload();
        }}
      >
        <div>
          <h2>Edit exam details</h2>
          <p className="small muted">Changes are visible to students right away.</p>
        </div>
        <label className="field">
          Exam name <input type="text" name="title" required maxLength={120} defaultValue={exam.title} />
        </label>
        <label className="field">
          Subject <input type="text" name="subject" required maxLength={60} defaultValue={exam.subject} />
        </label>
        <div className="form-grid">
          <label className="field">
            Total marks
            {byQuestion && <small>Set by the questions</small>}
            <input type="number" name="maxMarks" required min="1" step="any" defaultValue={exam.maxMarks} readOnly={byQuestion} />
          </label>
          <label className="field">
            Date <input type="date" name="examDate" defaultValue={exam.examDate ?? ''} />
          </label>
        </div>
        <FormError />
        <div className="row end">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <Submit>Save changes</Submit>
        </div>
      </Form>
    </Modal>
  );
}
