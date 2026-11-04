import { useState } from 'react';
import { Dropzone, FileList, useFileDelete, Viewer } from '../components/Files';
import { Form, Submit } from '../components/Form';
import { Icon, type IconName } from '../components/Icon';
import { BarCell, Callout, MetaItem, MistakeTag, PageHeader, Pill, Ring, toneFor } from '../components/kit';
import { useToast } from '../context/toast';
import { api, uploadFiles } from '../lib/api';
import { formatDate, pct, plural } from '../lib/format';
import { fileUrl } from '../lib/photos';
import type { Bridge, Exam, ExamStats, FileInfo, Peer, PeersView, ScoredQuestion, StudentExamDetail } from '../lib/types';

function OpenButtons({ files, label, icon }: { files: FileInfo[]; label: string; icon: IconName }) {
  return (
    <>
      {files.map((f, i) => (
        <a key={f.id} className="btn" href={fileUrl(f)} target="_blank" rel="noopener">
          <Icon name={icon} />
          {label}
          {files.length > 1 ? ` ${i + 1}` : ''}
        </a>
      ))}
    </>
  );
}

type Submission = NonNullable<StudentExamDetail['submission']>;

function ResultCard({ exam, submission, stats }: { exam: Exam; submission: Submission; stats: ExamStats | null }) {
  const score = pct(submission.marks ?? 0, exam.maxMarks);
  const avg = stats?.average == null ? null : pct(stats.average, exam.maxMarks);
  return (
    <section className="card">
      <div className="card-body row top nowrap">
        <Ring pct={score} caption={`${submission.marks} / ${exam.maxMarks}`} />
        <div className="grow stack tight">
          <div className="row">
            <h2>Your result</h2>
            {submission.isModel && <span className="pill gold">★ Chosen as a best answer</span>}
          </div>
          {avg !== null && (
            <p className="small muted">
              Class average {avg}% · Highest {stats!.highest} / {exam.maxMarks} · You are <b>{score >= avg ? `${score - avg} pts above` : `${avg - score} pts below`}</b> average
            </p>
          )}
          {submission.feedback && (
            <div className="callout">
              <span>
                <Icon name="note" />
              </span>
              <div>
                <b>Feedback from your teacher</b>
                <span>{submission.feedback}</span>
              </div>
            </div>
          )}
          {submission.helpful > 0 && (
            <p className="small muted">
              <Icon name="heart" /> {plural(submission.helpful, 'classmate')} found your answer helpful.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Breakdown({ breakdown }: { breakdown: ScoredQuestion[] }) {
  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Question breakdown</h2>
          <p>Where your marks came from, and where they went</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Question</th>
              <th>Score</th>
              <th className="hide-sm">What happened</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((q) => {
              const p = q.marks === null ? null : pct(q.marks, q.maxMarks);
              return (
                <tr key={q.id}>
                  <td>
                    <b>{q.label}</b>
                    {q.topic && <div className="tiny muted">{q.topic}</div>}
                  </td>
                  <td>{q.marks === null ? <span className="faint">–</span> : <BarCell value={q.marks} max={q.maxMarks} label={`${q.marks}/${q.maxMarks}`} tone={toneFor(p)} />}</td>
                  <td className="hide-sm">{p === 100 ? <Pill tone="good">Full marks</Pill> : q.mistake ? <MistakeTag mistake={q.mistake} /> : <span className="faint">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BridgeSection({ bridges, onJump }: { bridges: Bridge[]; onJump(peerId: string, question: string): void }) {
  if (!bridges.length) return null;
  const closable = bridges.filter((b) => b.peers.length);
  return (
    <section className="stack tight">
      <div className="bridge-hero">
        <p className="eyebrow">
          <Icon name="bridge" />
          Peer Bridge
        </p>
        <h2>Close your gaps, one question at a time</h2>
        <p>For every question where you lost marks, here’s a classmate’s answer that got that exact question fully right. Names stay hidden.</p>
      </div>
      {bridges.map((b) => (
        <div className="bridge" key={b.questionId}>
          <span className="q">{b.label}</span>
          <div>
            <b>
              You lost {plural(b.lost, 'mark')}
              {b.topic ? ` on ${b.topic}` : ''}
            </b>
            <p>{b.mistake ? <MistakeTag mistake={b.mistake} /> : 'Compare your working with a full-marks answer.'}</p>
          </div>
          <div className="row">
            {b.peers.length ? (
              b.peers.map((p) => (
                <button key={p.id} className="btn sm primary" type="button" onClick={() => onJump(p.id, b.label)}>
                  See {p.label}
                  <Icon name="arrow" />
                </button>
              ))
            ) : (
              <span className="small muted">No full-marks answer shared yet</span>
            )}
          </div>
        </div>
      ))}
      {closable.length === 0 && (
        <Callout tone="" icon="info" title="Nothing to bridge yet">
          Nobody shared a full-marks answer on these questions. Check the solution instead.
        </Callout>
      )}
    </section>
  );
}

function PeerCard({ peer, index, open, flash, onToggle }: { peer: Peer; index: number; open: boolean; flash: boolean; onToggle(open: boolean): void }) {
  const toast = useToast();
  const [helpful, setHelpful] = useState(peer.markedHelpful);
  return (
    <details className={`peer ${flash ? 'flash' : ''}`} id={`peer-${peer.id}`} open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>
        <span className={`avatar sm av-${index % 8}`}>{index + 1}</span>
        <span className="grow">{peer.label}</span>
        {peer.isModel && <span className="pill gold">★ Best answer</span>}
        {peer.helpful > 0 && (
          <span className="small muted">
            <Icon name="heart" /> {peer.helpful}
          </span>
        )}
        <Icon name="down" />
      </summary>
      {/* Pages load only when opened, so a phone does not download the whole class. */}
      <div className="body">{open && <Viewer files={peer.files} />}</div>
      <div className="body">
        <button
          className={`btn sm ${helpful ? 'on' : ''}`}
          type="button"
          onClick={async () => {
            try {
              const { markedHelpful } = await api<{ markedHelpful: boolean }>(`/submissions/${peer.id}/helpful`, { method: 'POST' });
              setHelpful(markedHelpful);
            } catch (err) {
              toast((err as Error).message, true);
            }
          }}
        >
          <Icon name="heart" />
          <span>{helpful ? 'Helpful' : 'This helped me'}</span>
        </button>
      </div>
    </details>
  );
}

function PeerList({ peers }: { peers: Extract<PeersView, { open: true }> }) {
  const toast = useToast();
  const [opened, setOpened] = useState<Set<string>>(() => new Set(peers.peers[0] && !peers.bridges.length ? [peers.peers[0].id] : []));
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const setOpen = (id: string, open: boolean) =>
    setOpened((s) => {
      const next = new Set(s);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  const jump = (id: string, question: string) => {
    setOpen(id, true);
    setFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    requestAnimationFrame(() => document.getElementById(`peer-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    toast(`Look for how they answered ${question}.`);
  };

  return (
    <>
      <BridgeSection bridges={peers.bridges} onJump={jump} />
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Learn from classmates</h2>
            <p>See how others approached the same paper</p>
          </div>
          <Pill tone="brand">{plural(peers.peers.length, 'answer')}</Pill>
        </div>
        <div className="card-body stack tight">
          {peers.peers.length ? (
            peers.peers.map((p, i) => (
              <PeerCard
                key={flash?.id === p.id ? `${p.id}-${flash.n}` : p.id}
                peer={p}
                index={i}
                open={opened.has(p.id)}
                flash={flash?.id === p.id}
                onToggle={(open) => setOpen(p.id, open)}
              />
            ))
          ) : (
            <p className="muted small">No classmates’ answers shared yet.</p>
          )}
        </div>
      </section>
    </>
  );
}

interface Props {
  data: StudentExamDetail;
  peers: PeersView;
  reload(): Promise<void>;
}

export function StudentExam({ data, peers, reload }: Props) {
  const { exam, paper, solution, submission, canUpload, stats, note } = data;
  const toast = useToast();
  const removeFile = useFileDelete(reload);
  const hasResult = exam.marksReleased && submission && submission.marks !== null;

  return (
    <>
      <PageHeader
        eyebrow={exam.subject}
        title={exam.title}
        meta={
          <>
            {exam.examDate && <MetaItem icon="calendar">{formatDate(exam.examDate)}</MetaItem>}
            <MetaItem icon="target">{exam.maxMarks} marks</MetaItem>
            {data.questionCount > 0 && <MetaItem icon="layers">{data.questionCount} questions</MetaItem>}
          </>
        }
        actions={<OpenButtons files={paper} label="Question paper" icon="file" />}
      />
      <div className="stack">
        {canUpload ? (
          <>
            {submission ? (
              <Callout tone="good" icon="check" title="Your answer is handed in">
                Forgot a page? You can add more until your teacher closes hand-in.
              </Callout>
            ) : (
              <Callout tone="brand" icon="camera" title="Upload your answer">
                Take a clear photo of each page, in order. Don’t write your name: classmates may see your sheet later.
              </Callout>
            )}
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>{submission ? 'Your pages' : 'Hand in'}</h2>
                  <p>{submission ? `${plural(submission.files.length, 'page')} uploaded` : 'PDF or photos'}</p>
                </div>
                {submission ? <Pill tone="good">Submitted</Pill> : <Pill tone="bad">Due</Pill>}
              </div>
              <div className="card-body">
                {submission && <FileList files={submission.files} onRemove={removeFile} />}
                <Dropzone
                  label={submission ? 'Add another page' : 'Choose your answer pages'}
                  upload={(files, progress) => uploadFiles(`/exams/${exam.id}/submission`, files, progress)}
                  done={reload}
                />
              </div>
            </section>
          </>
        ) : (
          <>
            {hasResult ? (
              <ResultCard exam={exam} submission={submission} stats={stats} />
            ) : (
              <Callout tone="brand" icon="clock" title="Marks are on their way">
                Your teacher hasn’t released marks yet. Meanwhile, compare your answer with the solution.
              </Callout>
            )}
            <div className="row">
              <OpenButtons files={solution} label="Solution" icon="shield" />
              {submission && <OpenButtons files={submission.files} label="My answer" icon="eye" />}
            </div>
            {hasResult && submission.breakdown.length > 0 && <Breakdown breakdown={submission.breakdown} />}
            {peers.open && <PeerList peers={peers} />}
            <Form
              className="card"
              onSubmit={async (values) => {
                await api(`/exams/${exam.id}/note`, { method: 'PUT', body: values });
                toast('Reflection saved.');
              }}
              toastErrors
            >
              <div className="card-header">
                <div>
                  <h2>Reflection</h2>
                  <p>Private to you. What will you do differently next time?</p>
                </div>
                <Icon name="lock" />
              </div>
              <div className="card-body stack tight">
                <textarea
                  name="body"
                  maxLength={5000}
                  aria-label="My reflection"
                  placeholder="e.g. Write every step in Q2. Re-check arithmetic before moving on."
                  defaultValue={note}
                />
                <div>
                  <Submit className="btn">Save reflection</Submit>
                </div>
              </div>
            </Form>
            {!submission && exam.status === 'review' && (
              <Callout tone="warn" icon="alert" title="No answer handed in">
                You did not upload an answer for this exam.
              </Callout>
            )}
          </>
        )}
      </div>
    </>
  );
}
