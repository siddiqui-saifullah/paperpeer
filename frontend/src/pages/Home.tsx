import { Icon } from '../components/Icon';
import { Avatar, BarCell, Callout, Empty, Kpi, MISTAKES, PageHeader, Pill, staffStage, SubjectIcon, toneFor, TopicRow } from '../components/kit';
import { Page } from '../components/Page';
import { useMe, useSession } from '../context/session';
import { useLoad } from '../hooks/useApi';
import { api } from '../lib/api';
import { formatDate, pct, percent, plural } from '../lib/format';
import { studentStatus } from '../lib/status';
import type { Me, Mistake, SchoolClass, SchoolInsights, Skill, StaffExam, StudentExam } from '../lib/types';

// ───────── Teacher ─────────

/** The single thing a teacher should do next on an exam. */
function nextMove(e: StaffExam): string | null {
  if (e.status === 'draft') return 'Publish to students';
  if (e.status === 'collecting') return `${e.classSize - e.submitted} still to upload`;
  if (!e.submitted) return 'Upload answer sheets';
  if (e.submitted > e.graded) return `Mark ${plural(e.submitted - e.graded, 'answer')}`;
  if (!e.marksReleased) return 'Release marks';
  return null;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

function SetupGuide({ me, classes, exams }: { me: Me; classes: SchoolClass[]; exams: StaffExam[] }) {
  const steps = [
    { done: true, title: 'Create your workspace', text: `School code ${me.school.code}`, href: '#/' },
    { done: classes.some((c) => (c.students ?? 0) > 0), title: 'Add your students', text: 'Paste a class list. Logins are generated for you.', href: '#/people' },
    { done: exams.length > 0, title: 'Create your first exam', text: 'Split it into questions to unlock the Mistake Map.', href: '#/exams/new' },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <section className="card gap-below">
      <div className="card-header">
        <div>
          <h2>Get your school set up</h2>
          <p>
            {steps.filter((s) => s.done).length} of {steps.length} done
          </p>
        </div>
      </div>
      <div className="list">
        {steps.map((s, i) => (
          <div className="list-item" key={s.title}>
            <span className={`avatar sm ${s.done ? 'av-2' : 'av-0'}`}>{s.done ? <Icon name="check" /> : i + 1}</span>
            <div className="main-col">
              <b>{s.title}</b>
              <span>{s.text}</span>
            </div>
            {i === current && (
              <a className="btn primary sm" href={s.href}>
                Start <Icon name="arrow" />
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const NewExam = () => (
  <a className="btn primary" href="#/exams/new">
    <Icon name="plus" />
    New exam
  </a>
);

function StaffDashboard({ exams, classes, insights }: { exams: StaffExam[]; classes: SchoolClass[]; insights: SchoolInsights }) {
  const me = useMe();
  const live = exams.filter((e) => e.status !== 'draft');
  const collecting = exams.filter((e) => e.status === 'collecting');
  const toMark = exams.reduce((n, e) => n + (e.status === 'review' ? e.submitted - e.graded : 0), 0);
  const expected = live.reduce((n, e) => n + e.classSize, 0);
  const handedIn = live.reduce((n, e) => n + e.submitted, 0);
  const averages = exams.filter((e) => e.averagePct !== null);
  const schoolAvg = averages.length ? Math.round(averages.reduce((n, e) => n + (e.averagePct ?? 0), 0) / averages.length) : null;
  const queue = exams.flatMap((e) => {
    const move = nextMove(e);
    return move ? [{ e, move }] : [];
  });
  // Exams already in the attention queue are not listed again under results.
  const done = exams.filter((e) => !nextMove(e));
  const weakest = insights.topics.slice(0, 4);
  const setupDone = classes.some((c) => (c.students ?? 0) > 0) && exams.length > 0;
  const avgTone = toneFor(schoolAvg);

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}, ${me.name.split(' ')[0]}`}
        sub={`Here’s what needs you at ${me.school.name} today.`}
        actions={
          <>
            <a className="btn" href="#/insights">
              <Icon name="map" />
              Open Mistake Map
            </a>
            <NewExam />
          </>
        }
      />
      {!setupDone && <SetupGuide me={me} classes={classes} exams={exams} />}
      <div className="kpis">
        <Kpi label="Collecting answers" value={collecting.length} unit={collecting.length === 1 ? 'exam' : 'exams'} foot={`${exams.length} exams in total`} icon="inbox" />
        <Kpi
          label="Waiting to be marked"
          value={toMark}
          unit="answers"
          foot={toMark ? 'Marking queue is open' : 'All caught up'}
          footTone={toMark ? 'down' : 'up'}
          icon="pen"
        />
        <Kpi label="Hand-in rate" value={expected ? `${pct(handedIn, expected)}%` : '–'} foot={`${handedIn} of ${expected} answer sheets`} icon="upload" />
        <Kpi
          label="Average score"
          value={schoolAvg === null ? '–' : `${schoolAvg}%`}
          foot="Across marked exams"
          footTone={avgTone === 'good' ? 'up' : avgTone === 'bad' ? 'down' : ''}
          icon="trend"
        />
      </div>

      <div className="grid main-side">
        <div className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Needs your attention</h2>
                <p>The next step on each exam, in one place</p>
              </div>
              {queue.length > 0 && <Pill tone="warn">{queue.length} open</Pill>}
            </div>
            {queue.length ? (
              <div className="list">
                {queue.slice(0, 6).map(({ e, move }) => {
                  const stage = staffStage(e);
                  return (
                    <a className="list-item" href={`#/exams/${e.id}`} key={e.id}>
                      <SubjectIcon subject={e.subject} />
                      <div className="main-col">
                        <b>{e.title}</b>
                        <span>
                          {e.subject} · {e.className}
                          {e.examDate ? ` · ${formatDate(e.examDate)}` : ''}
                        </span>
                      </div>
                      <span className="hide-sm">
                        <Pill tone={stage.tone}>{stage.label}</Pill>
                      </span>
                      <span className="btn sm">{move}</span>
                    </a>
                  );
                })}
              </div>
            ) : (
              <Empty icon="check" title="You’re all caught up" text="Every exam is marked and released." />
            )}
          </section>

          {(done.length > 0 || !exams.length) && (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Latest results</h2>
                  <p>Marked and released</p>
                </div>
                <a className="btn sm ghost" href="#/exams">
                  All exams <Icon name="arrow" />
                </a>
              </div>
              {done.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Exam</th>
                        <th>Status</th>
                        <th className="hide-sm">Handed in</th>
                        <th className="right">Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {done.slice(0, 5).map((e) => {
                        const stage = staffStage(e);
                        return (
                          <tr key={e.id}>
                            <td>
                              <a className="cell-title" href={`#/exams/${e.id}`}>
                                <SubjectIcon subject={e.subject} />
                                <div>
                                  <b>{e.title}</b>
                                  <span>{e.className}</span>
                                </div>
                              </a>
                            </td>
                            <td>
                              <Pill tone={stage.tone}>{stage.label}</Pill>
                            </td>
                            <td className="hide-sm">
                              <BarCell value={e.submitted} max={e.classSize} label={`${e.submitted}/${e.classSize}`} />
                            </td>
                            <td className="right num">
                              {e.averagePct === null ? (
                                <span className="faint">–</span>
                              ) : (
                                <Pill tone={toneFor(e.averagePct)} dot={false}>
                                  {e.averagePct}%
                                </Pill>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon="exams" title="No exams yet" text="Create an exam and upload the question paper." action={<NewExam />} />
              )}
            </section>
          )}
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Weakest topics</h2>
                <p>From per-question marking</p>
              </div>
              <Icon name="map" />
            </div>
            <div className="card-body">
              {weakest.length ? (
                <>
                  <div className="stack">
                    {weakest.map((t) => {
                      const top = (Object.entries(t.mistakes) as [Mistake, number][]).sort((a, b) => b[1] - a[1])[0];
                      const cause = top && top[1] > 0 ? ` · mostly ${MISTAKES[top[0]].label.toLowerCase()}s` : '';
                      return <TopicRow key={`${t.topic}-${t.className}`} title={t.topic} pct={t.masteryPct} detail={`${t.className}${cause}`} />;
                    })}
                  </div>
                  <a className="btn sm block gap-above" href="#/insights">
                    See full Mistake Map
                  </a>
                </>
              ) : (
                <Callout tone="brand" icon="spark" title="Unlock topic insights">
                  Split an exam into questions with topics, then mark by question.
                </Callout>
              )}
            </div>
          </section>
          <Watchlist insights={insights} />
        </div>
      </div>
    </>
  );
}

function Watchlist({ insights }: { insights: SchoolInsights }) {
  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Students to check in on</h2>
          <p>Average below 60%</p>
        </div>
      </div>
      {insights.watchlist.length ? (
        <div className="list">
          {insights.watchlist.slice(0, 5).map((w) => (
            <div className="list-item" key={w.id}>
              <Avatar name={w.name} />
              <div className="main-col">
                <b>{w.name}</b>
                <span>
                  {w.className || 'No class'} · {plural(w.exams, 'exam')}
                </span>
              </div>
              <Pill tone={toneFor(w.averagePct)} dot={false}>
                {w.averagePct}%
              </Pill>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-body">
          <p className="muted small">No one is below 60% right now.</p>
        </div>
      )}
    </section>
  );
}

// ───────── Student ─────────

/**
 * Your score against the class average, oldest exam first. Percentages keep
 * exams with different total marks on one axis. Needs two exams to show a trend.
 */
export function ProgressChart({ exams }: { exams: StudentExam[] }) {
  const points = exams
    .flatMap((e) => (e.marks !== null && e.classAverage !== null ? [{ title: e.title, you: percent(e.marks, e.maxMarks), cls: percent(e.classAverage, e.maxMarks) }] : []))
    .reverse();
  if (points.length < 2) return null;
  const [w, h, left, right, top, bottom] = [640, 220, 40, 16, 14, 30];
  const x = (i: number) => left + (i * (w - left - right)) / (points.length - 1);
  const y = (v: number) => top + ((100 - v) * (h - top - bottom)) / 100;
  const line = (key: 'you' | 'cls') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
  const area = `${line('you')} L${x(points.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Your progress</h2>
          <p>Score per exam compared with the class average</p>
        </div>
        <div className="legend">
          <span>
            <i className="legend-line" />
            You
          </span>
          <span>
            <i className="legend-line cls" />
            Class average
          </span>
        </div>
      </div>
      <div className="card-body">
        <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Your score compared with the class average in each exam">
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line className="grid" x1={left} x2={w - right} y1={y(v)} y2={y(v)} />
              <text className="axis" x={left - 10} y={y(v) + 4} textAnchor="end">
                {v}%
              </text>
            </g>
          ))}
          <path className="area" d={area} />
          <path className="series cls" d={line('cls')} />
          <path className="series you" d={line('you')} />
          {points.map((p, i) => (
            <g className="point" key={i}>
              <title>{`${p.title}: you ${p.you}%, class average ${p.cls}%`}</title>
              <rect className="hit" x={x(i) - 24} y="0" width="48" height={h} />
              <circle className="cls" cx={x(i)} cy={y(p.cls)} r="3.5" />
              <circle className="you" cx={x(i)} cy={y(p.you)} r="4.5" />
              <text className="axis" x={x(i)} y={h - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
                {p.title.length > 14 ? `${p.title.slice(0, 13)}…` : p.title}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}

function StudentDashboard({ exams, skills }: { exams: StudentExam[]; skills: Skill[] }) {
  const me = useMe();
  const todo = exams.filter((e) => e.status === 'collecting' && !e.submitted);
  const results = exams.filter((e) => e.marks !== null);
  const mine = results.map((e) => percent(e.marks ?? 0, e.maxMarks));
  const avg = mine.length ? Math.round(mine.reduce((a, b) => a + b, 0) / mine.length) : null;
  const classAvgs = results.flatMap((e) => (e.classAverage !== null ? [percent(e.classAverage, e.maxMarks)] : []));
  const classAvg = classAvgs.length ? Math.round(classAvgs.reduce((a, b) => a + b, 0) / classAvgs.length) : null;
  const gap = avg !== null && classAvg !== null ? avg - classAvg : null;
  const focus = skills.slice(0, 3);
  const strongest = skills.at(-1);

  return (
    <>
      <PageHeader
        eyebrow={me.school.name}
        title={`Hi, ${me.name.split(' ')[0]} 👋`}
        sub={todo.length ? `You have ${plural(todo.length, 'answer')} to upload.` : 'You’re up to date. Here’s how you’re doing.'}
      />
      <div className="kpis">
        <Kpi label="Your average" value={avg === null ? '–' : `${avg}%`} foot={`${plural(results.length, 'exam')} with results`} icon="trend" />
        <Kpi
          label="Versus class"
          value={gap === null ? '–' : `${gap > 0 ? '+' : ''}${gap}`}
          unit={gap === null ? '' : 'pts'}
          foot={gap === null ? 'Needs released marks' : gap >= 0 ? 'Above class average' : 'Below class average'}
          footTone={gap === null ? '' : gap >= 0 ? 'up' : 'down'}
          icon="people"
        />
        <Kpi
          label="Strongest topic"
          text={!!strongest}
          value={strongest ? strongest.topic : '–'}
          foot={strongest ? `${strongest.masteryPct}% mastery` : 'Appears after marking'}
          icon="star"
        />
        <Kpi
          label="To upload"
          value={todo.length}
          foot={todo.length ? 'Before your teacher closes uploads' : 'Nothing pending'}
          footTone={todo.length ? 'down' : 'up'}
          icon="upload"
        />
      </div>

      <div className="grid main-side">
        <div className="stack">
          {todo.length > 0 && (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>To do</h2>
                  <p>Upload a clear photo of every page</p>
                </div>
                <Pill tone="bad">{todo.length} due</Pill>
              </div>
              <div className="list">
                {todo.map((e) => (
                  <a className="list-item" href={`#/exams/${e.id}`} key={e.id}>
                    <SubjectIcon subject={e.subject} />
                    <div className="main-col">
                      <b>{e.title}</b>
                      <span>
                        {e.subject}
                        {e.examDate ? ` · ${formatDate(e.examDate)}` : ''}
                      </span>
                    </div>
                    <span className="btn primary sm">
                      <Icon name="upload" />
                      Upload answer
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}
          <ProgressChart exams={exams} />
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Recent exams</h2>
              </div>
              <a className="btn sm ghost" href="#/exams">
                View all <Icon name="arrow" />
              </a>
            </div>
            {exams.length ? (
              <div className="list">
                {exams.slice(0, 6).map((e) => {
                  const s = studentStatus(e);
                  const score = e.marks !== null ? percent(e.marks, e.maxMarks) : null;
                  return (
                    <a className="list-item" href={`#/exams/${e.id}`} key={e.id}>
                      <SubjectIcon subject={e.subject} />
                      <div className="main-col">
                        <b>{e.title}</b>
                        <span>
                          {e.subject}
                          {e.examDate ? ` · ${formatDate(e.examDate)}` : ''}
                        </span>
                      </div>
                      {score !== null ? (
                        <Pill tone={toneFor(score)} dot={false}>
                          {e.marks}/{e.maxMarks}
                        </Pill>
                      ) : (
                        <Pill tone={s.tone}>{s.label}</Pill>
                      )}
                      <span className="chev">
                        <Icon name="chevron" />
                      </span>
                    </a>
                  );
                })}
              </div>
            ) : (
              <Empty title="Nothing here yet" text="Your exams will appear here when your teacher publishes them." />
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Focus next</h2>
                <p>Your weakest topics</p>
              </div>
              <Icon name="target" />
            </div>
            <div className="card-body">
              {focus.length ? (
                <>
                  <div className="stack">
                    {focus.map((t) => (
                      <TopicRow key={`${t.subject}-${t.topic}`} title={t.topic} pct={t.masteryPct} detail={t.subject} />
                    ))}
                  </div>
                  <a className="btn sm block gap-above" href="#/skills">
                    Open Skill Map
                  </a>
                </>
              ) : (
                <Callout tone="brand" icon="spark" title="Your Skill Map is on its way">
                  It fills in once your teacher marks an exam question by question.
                </Callout>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

type HomeData =
  | { staff: true; exams: StaffExam[]; classes: SchoolClass[]; insights: SchoolInsights }
  | { staff: false; exams: StudentExam[]; skills: Skill[] };

export function HomePage() {
  const { isStaff } = useSession();
  const load = useLoad<HomeData>(`home:${isStaff}`, async () => {
    if (isStaff) {
      const [{ exams }, { classes }, insights] = await Promise.all([
        api<{ exams: StaffExam[] }>('/exams'),
        api<{ classes: SchoolClass[] }>('/classes'),
        api<SchoolInsights>('/insights'),
      ]);
      return { staff: true, exams, classes, insights };
    }
    const [{ exams }, { skills }] = await Promise.all([api<{ exams: StudentExam[] }>('/exams'), api<{ skills: Skill[] }>('/me/skills')]);
    return { staff: false, exams, skills };
  });
  return (
    <Page load={load} active="home" title={isStaff ? 'Overview' : 'Home'}>
      {(d) => (d.staff ? <StaffDashboard exams={d.exams} classes={d.classes} insights={d.insights} /> : <StudentDashboard exams={d.exams} skills={d.skills} />)}
    </Page>
  );
}
