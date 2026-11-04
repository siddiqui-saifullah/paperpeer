import { useState } from 'react';
import { Icon } from '../components/Icon';
import { BarCell, Empty, PageHeader, Pill, staffStage, SubjectIcon, toneFor } from '../components/kit';
import { Page } from '../components/Page';
import { useSession } from '../context/session';
import { useLoad } from '../hooks/useApi';
import { api } from '../lib/api';
import { formatDate, percent, store } from '../lib/format';
import { studentStatus } from '../lib/status';
import type { SchoolClass, StaffExam, StudentExam } from '../lib/types';

type Filter = [key: string, label: string];
const STAFF_FILTERS: Filter[] = [['all', 'All'], ['draft', 'Draft'], ['collecting', 'Collecting'], ['marking', 'Marking'], ['ready', 'Ready'], ['released', 'Released']];
const STUDENT_FILTERS: Filter[] = [['all', 'All'], ['todo', 'To do'], ['waiting', 'Being marked'], ['results', 'Results out']];

const goTo = (href: string) => (e: React.MouseEvent) => {
  if (!(e.target as HTMLElement).closest('a, button, input')) location.hash = href;
};

function useFilters() {
  const [query, setQuery] = useState('');
  const [stage, setStageState] = useState(store.get('examStage') || 'all');
  const [classId, setClassState] = useState(store.get('classFilter'));
  return {
    query,
    setQuery,
    stage,
    setStage: (s: string) => {
      store.set('examStage', s);
      setStageState(s);
    },
    classId,
    setClassId: (c: string) => {
      store.set('classFilter', c);
      setClassState(c);
    },
  };
}
type Filters = ReturnType<typeof useFilters>;

function Toolbar({ filters, options, classes }: { filters: Filters; options: Filter[]; classes: SchoolClass[] }) {
  const stage = options.some(([k]) => k === filters.stage) ? filters.stage : 'all';
  return (
    <div className="toolbar">
      <label className="search">
        <Icon name="search" />
        <input type="search" placeholder="Search exams…" aria-label="Search exams" value={filters.query} onChange={(e) => filters.setQuery(e.target.value)} />
      </label>
      <div className="segmented" role="group" aria-label="Filter by status">
        {options.map(([key, label]) => (
          <button type="button" key={key} className={stage === key ? 'active' : ''} onClick={() => filters.setStage(key)}>
            {label}
          </button>
        ))}
      </div>
      {classes.length > 1 && (
        <select className="input-sm" aria-label="Class" value={filters.classId} onChange={(e) => filters.setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

const NoMatch = () => <Empty icon="search" title="No matching exams" text="Try another search or filter." />;

const NewExamButton = () => (
  <a className="btn primary" href="#/exams/new">
    <Icon name="plus" />
    New exam
  </a>
);

function StaffList({ exams, classes }: { exams: StaffExam[]; classes: SchoolClass[] }) {
  const filters = useFilters();
  const q = filters.query.trim().toLowerCase();
  const stage = STAFF_FILTERS.some(([k]) => k === filters.stage) ? filters.stage : 'all';
  const shown = exams.filter(
    (e) =>
      (!q || `${e.title} ${e.subject} ${e.className}`.toLowerCase().includes(q)) &&
      (stage === 'all' || staffStage(e).key === stage) &&
      (!filters.classId || String(e.classId) === filters.classId),
  );
  return (
    <>
      <PageHeader title="Exams" sub="Every paper, hand-in and result across your school." actions={<NewExamButton />} />
      <section className="card">
        {exams.length ? (
          <>
            <Toolbar filters={filters} options={STAFF_FILTERS} classes={classes} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Exam</th>
                    <th>Status</th>
                    <th className="hide-sm">Handed in</th>
                    <th className="hide-sm">Marked</th>
                    <th className="right">Average</th>
                    <th className="hide-sm">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e) => {
                    const s = staffStage(e);
                    return (
                      <tr key={e.id} className="clickable" onClick={goTo(`#/exams/${e.id}`)}>
                        <td>
                          <a className="cell-title" href={`#/exams/${e.id}`}>
                            <SubjectIcon subject={e.subject} />
                            <div>
                              <b>{e.title}</b>
                              <span>
                                {e.subject} · {e.className}
                              </span>
                            </div>
                          </a>
                        </td>
                        <td>
                          <Pill tone={s.tone}>{s.label}</Pill>
                        </td>
                        <td className="hide-sm">
                          {e.status === 'draft' ? <span className="faint">–</span> : <BarCell value={e.submitted} max={e.classSize} label={`${e.submitted}/${e.classSize}`} />}
                        </td>
                        <td className="hide-sm">
                          {e.submitted ? (
                            <BarCell value={e.graded} max={e.submitted} label={`${e.graded}/${e.submitted}`} tone={e.graded === e.submitted ? 'good' : 'warn'} />
                          ) : (
                            <span className="faint">–</span>
                          )}
                        </td>
                        <td className="right">
                          {e.averagePct === null ? (
                            <span className="faint">–</span>
                          ) : (
                            <Pill tone={toneFor(e.averagePct)} dot={false}>
                              {e.averagePct}%
                            </Pill>
                          )}
                        </td>
                        <td className="hide-sm muted">{formatDate(e.examDate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!shown.length && <NoMatch />}
          </>
        ) : (
          <Empty icon="exams" title="Create your first exam" text="Upload the question paper, split it into questions, and publish it to a class." action={<NewExamButton />} />
        )}
      </section>
    </>
  );
}

function studentKey(e: StudentExam) {
  const s = studentStatus(e).label;
  return s === 'To do' ? 'todo' : s === 'Results out' ? 'results' : 'waiting';
}

function StudentList({ exams }: { exams: StudentExam[] }) {
  const filters = useFilters();
  const q = filters.query.trim().toLowerCase();
  const stage = STUDENT_FILTERS.some(([k]) => k === filters.stage) ? filters.stage : 'all';
  const shown = exams.filter((e) => (!q || `${e.title} ${e.subject}`.toLowerCase().includes(q)) && (stage === 'all' || studentKey(e) === stage));
  return (
    <>
      <PageHeader title="My exams" sub="Papers, your answers, results and classmates’ approaches." />
      <section className="card">
        {exams.length ? (
          <>
            <Toolbar filters={filters} options={STUDENT_FILTERS} classes={[]} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Exam</th>
                    <th>Status</th>
                    <th className="right">Your score</th>
                    <th className="right hide-sm">Class avg</th>
                    <th className="hide-sm">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e) => {
                    const s = studentStatus(e);
                    const score = e.marks !== null ? percent(e.marks, e.maxMarks) : null;
                    return (
                      <tr key={e.id} className="clickable" onClick={goTo(`#/exams/${e.id}`)}>
                        <td>
                          <a className="cell-title" href={`#/exams/${e.id}`}>
                            <SubjectIcon subject={e.subject} />
                            <div>
                              <b>{e.title}</b>
                              <span>{e.subject}</span>
                            </div>
                          </a>
                        </td>
                        <td>
                          <Pill tone={s.tone}>{s.label}</Pill>
                        </td>
                        <td className="right num">
                          {score === null ? (
                            <span className="faint">–</span>
                          ) : (
                            <Pill tone={toneFor(score)} dot={false}>
                              {e.marks}/{e.maxMarks}
                            </Pill>
                          )}
                        </td>
                        <td className="right hide-sm num muted">{e.classAverage === null ? '–' : `${percent(e.classAverage, e.maxMarks)}%`}</td>
                        <td className="hide-sm muted">{formatDate(e.examDate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!shown.length && <NoMatch />}
          </>
        ) : (
          <Empty title="No exams yet" text="Your exams will appear here when your teacher publishes them." />
        )}
      </section>
    </>
  );
}

export function ExamsPage() {
  const { isStaff } = useSession();
  const load = useLoad(`exams:${isStaff}`, async () => {
    const [{ exams }, { classes }] = await Promise.all([
      api<{ exams: (StaffExam & StudentExam)[] }>('/exams'),
      api<{ classes: SchoolClass[] }>('/classes'),
    ]);
    return { exams, classes };
  });
  return (
    <Page load={load} active="exams" title={isStaff ? 'Exams' : 'My exams'}>
      {({ exams, classes }) => (isStaff ? <StaffList exams={exams} classes={classes} /> : <StudentList exams={exams} />)}
    </Page>
  );
}
