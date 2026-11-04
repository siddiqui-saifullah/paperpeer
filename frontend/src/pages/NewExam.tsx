import { useState } from 'react';
import { Form, FormError, Submit } from '../components/Form';
import { Icon } from '../components/Icon';
import { Callout, Empty, PageHeader } from '../components/kit';
import { Page } from '../components/Page';
import { checkDrafts, draftTotal, QuestionBuilder, type QuestionDraft } from '../components/QuestionBuilder';
import { useToast } from '../context/toast';
import { useApi } from '../hooks/useApi';
import { api, uploadFiles } from '../lib/api';
import { ACCEPT, preparePhotos } from '../lib/photos';
import type { SchoolClass } from '../lib/types';

const STARTER: QuestionDraft[] = [
  { label: 'Q1', topic: '', maxMarks: '10' },
  { label: 'Q2', topic: '', maxMarks: '10' },
  { label: 'Q3', topic: '', maxMarks: '10' },
];

/** A file picker that shows what was picked. */
function FilePick({ icon, title, hint, files, onPick }: { icon: 'file' | 'shield'; title: string; hint: string; files: File[]; onPick(f: File[]): void }) {
  return (
    <label className={`drop ${files.length ? 'over' : ''}`}>
      <input type="file" multiple accept={ACCEPT} onChange={(e) => onPick([...(e.target.files ?? [])])} />
      <Icon name={icon} />
      <b>{title}</b>
      <span>{files.length ? files.map((f) => f.name).join(', ') : hint}</span>
    </label>
  );
}

function NewExamForm({ classes }: { classes: SchoolClass[] }) {
  const toast = useToast();
  const [byQuestion, setByQuestion] = useState(true);
  const [questions, setQuestions] = useState(STARTER);
  const [total, setTotal] = useState('');
  const [paper, setPaper] = useState<File[]>([]);
  const [solution, setSolution] = useState<File[]>([]);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Create exam" sub="Set it up once. PaperPeer handles hand-in, marking and sharing." />
      <Form
        className="card"
        onSubmit={async (data, _form, intent) => {
          const list = byQuestion ? checkDrafts(questions) : [];
          if (intent === 'publish' && !paper.length) throw new Error('Add the question paper before publishing.');
          const body = { ...data, maxMarks: byQuestion ? draftTotal(questions) : data.maxMarks };
          const { id } = await api<{ id: number }>('/exams', { method: 'POST', body });
          // The exam now exists, so a failed step continues from its page, not this form.
          try {
            if (list.length) await api(`/exams/${id}/questions`, { method: 'PUT', body: { questions: list } });
            if (paper.length) await uploadFiles(`/exams/${id}/files?kind=paper`, await preparePhotos(paper));
            if (solution.length) await uploadFiles(`/exams/${id}/files?kind=solution`, await preparePhotos(solution));
            if (intent === 'publish') await api(`/exams/${id}`, { method: 'PATCH', body: { status: 'collecting' } });
            toast(intent === 'publish' ? 'Published. Students can now upload answers.' : 'Draft saved.');
          } catch (err) {
            toast(`Exam saved, but: ${(err as Error).message}`, true);
          }
          location.hash = `#/exams/${id}`;
        }}
      >
        <section className="form-section">
          <div className="about">
            <h3>Details</h3>
            <p>What students see at the top of the exam.</p>
          </div>
          <div className="form-grid">
            <label className="field span-2">
              Exam name <input type="text" name="title" required maxLength={120} placeholder="Unit Test 2" autoFocus />
            </label>
            <label className="field">
              Subject <input type="text" name="subject" required maxLength={60} placeholder="Mathematics" />
            </label>
            <label className="field">
              Class
              <select name="classId" required>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.students} students
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Date <input type="date" name="examDate" defaultValue={today} />
            </label>
            <label className="field">
              Total marks
              <input
                type="number"
                name="maxMarks"
                min="1"
                step="any"
                inputMode="decimal"
                readOnly={byQuestion}
                required={!byQuestion}
                value={byQuestion ? draftTotal(questions) || '' : total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </label>
          </div>
        </section>
        <section className="form-section">
          <div className="about">
            <h3>
              Questions <span className="pill brand no-dot">Recommended</span>
            </h3>
            <p>Mark question by question to unlock the Mistake Map, each student’s Skill Map and Peer Bridge.</p>
          </div>
          <div className="stack tight">
            <label className="switch">
              <div>
                <b>Mark by question</b>
                <span>Total marks are added up from the questions.</span>
              </div>
              <input type="checkbox" checked={byQuestion} onChange={(e) => setByQuestion(e.target.checked)} />
            </label>
            {byQuestion && <QuestionBuilder value={questions} onChange={setQuestions} />}
          </div>
        </section>
        <section className="form-section">
          <div className="about">
            <h3>Files</h3>
            <p>PDF or photos. The solution stays hidden until answers close.</p>
          </div>
          <div className="grid cols-2">
            <FilePick icon="file" title="Question paper" hint="Required to publish" files={paper} onPick={setPaper} />
            <FilePick icon="shield" title="Solution" hint="Optional" files={solution} onPick={setSolution} />
          </div>
        </section>
        <div className="card-foot">
          <FormError />
          <div className="row between">
            <span className="small muted">
              <Icon name="lock" /> Only this class can see the exam.
            </span>
            <div className="row">
              <Submit className="btn" value="draft">
                Save as draft
              </Submit>
              <Submit value="publish">
                <Icon name="arrow" />
                Publish to students
              </Submit>
            </div>
          </div>
        </div>
      </Form>
      <div className="gap-above">
        <Callout tone="brand" icon="spark" title="Tip">
          Give each question a topic. Topics roll up across exams, so you can see which ideas a class keeps missing.
        </Callout>
      </div>
    </>
  );
}

export function NewExamPage() {
  const load = useApi<{ classes: SchoolClass[] }>('/classes');
  return (
    <Page load={load} active="exams" title="New exam" crumbs={[['Exams', '#/exams']]}>
      {({ classes }) =>
        classes.length ? (
          <NewExamForm classes={classes} />
        ) : (
          <div className="card">
            <Empty
              icon="people"
              title="Add your students first"
              text="Every exam belongs to a class. Paste a class list and logins are created for you."
              action={
                <a className="btn primary" href="#/people">
                  <Icon name="plus" />
                  Add students
                </a>
              }
            />
          </div>
        )
      }
    </Page>
  );
}
