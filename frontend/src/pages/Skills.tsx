import { Icon } from '../components/Icon';
import { Callout, Empty, Kpi, masteryLevel, PageHeader, Pill, toneFor } from '../components/kit';
import { Page } from '../components/Page';
import { useApi } from '../hooks/useApi';
import { plural } from '../lib/format';
import type { Skill } from '../lib/types';

// A student's own mastery per topic, from every exam marked question by question.
function SkillMap({ skills }: { skills: Skill[] }) {
  const focus = skills.filter((s) => s.masteryPct < 70);
  const strong = skills.filter((s) => s.masteryPct >= 85);
  const subjects = [...new Set(skills.map((s) => s.subject))];

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Icon name="spark" />
            Only in PaperPeer
          </>
        }
        title="Skill Map"
        sub="Your mastery of each topic, built from every question your teacher has marked."
      />
      {skills.length ? (
        <>
          <div className="kpis">
            <Kpi label="Topics" value={skills.length} foot={plural(subjects.length, 'subject')} icon="layers" />
            <Kpi label="Mastered" value={strong.length} foot="85% or more" footTone="up" icon="star" />
            <Kpi label="Focus areas" value={focus.length} foot="Below 70%" footTone={focus.length ? 'down' : 'up'} icon="target" />
            <Kpi label="Questions analysed" value={skills.reduce((n, s) => n + s.questions, 0)} icon="exams" />
          </div>
          <div className="grid main-side">
            <div className="stack">
              {subjects.map((subject) => (
                <section className="card" key={subject}>
                  <div className="card-header">
                    <div>
                      <h2>{subject}</h2>
                    </div>
                  </div>
                  <div className="card-body">
                    {skills
                      .filter((s) => s.subject === subject)
                      .map((s) => (
                        <div className="skill" key={s.topic}>
                          <div>
                            <b>{s.topic}</b>
                            <span>
                              {plural(s.questions, 'question')} · {masteryLevel(s.masteryPct)}
                            </span>
                          </div>
                          <progress className={`bar ${toneFor(s.masteryPct)}`} max={100} value={s.masteryPct} />
                          <span className={`pct ${toneFor(s.masteryPct)}`}>{s.masteryPct}%</span>
                        </div>
                      ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="stack">
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2>Your study plan</h2>
                    <p>Start at the top</p>
                  </div>
                  <Icon name="target" />
                </div>
                {focus.length ? (
                  <div className="list">
                    {focus.map((s, i) => (
                      <div className="list-item" key={`${s.subject}-${s.topic}`}>
                        <span className={`avatar sm av-${i % 8}`}>{i + 1}</span>
                        <div className="main-col">
                          <b>{s.topic}</b>
                          <span>{s.subject}</span>
                        </div>
                        <Pill tone={toneFor(s.masteryPct)}>{s.masteryPct}%</Pill>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="card-body">
                    <p className="small muted">No focus areas. Great work: keep it up.</p>
                  </div>
                )}
              </section>
              <Callout tone="brand" icon="bridge" title="Use Peer Bridge">
                Open any result to see a classmate’s full-marks answer for each question you lost marks on.
              </Callout>
            </div>
          </div>
        </>
      ) : (
        <section className="card">
          <Empty
            icon="target"
            title="Your Skill Map is on its way"
            text="It fills in when your teacher marks an exam question by question and releases the marks."
            action={
              <a className="btn" href="#/exams">
                See my exams
              </a>
            }
          />
        </section>
      )}
    </>
  );
}

export function SkillsPage() {
  const load = useApi<{ skills: Skill[] }>('/me/skills');
  return (
    <Page load={load} active="skills" title="Skill Map">
      {({ skills }) => <SkillMap skills={skills} />}
    </Page>
  );
}
