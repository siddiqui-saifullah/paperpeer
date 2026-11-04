import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Callout, Empty, Kpi, MISTAKE_KEYS, MISTAKES, PageHeader, Pill, toneFor } from '../components/kit';
import { InsightList, MistakeMatrix, type Insight } from '../components/MistakeMap';
import { Page } from '../components/Page';
import { useApi } from '../hooks/useApi';
import { store } from '../lib/format';
import type { SchoolInsights } from '../lib/types';

// School-wide Mistake Map: every topic, in every class, with the kinds of
// mistakes behind lost marks. Built from per-question marking across all exams.
function MistakeMapView({ topics, watchlist }: SchoolInsights) {
  const classes = [...new Set(topics.map((t) => t.className))];
  const [picked, setPicked] = useState(store.get('insightClass'));
  const shownClass = classes.includes(picked) ? picked : '';
  const shown = topics.filter((t) => !shownClass || t.className === shownClass);
  const totals = MISTAKE_KEYS.map((k) => [k, shown.reduce((n, t) => n + t.mistakes[k], 0)] as const).sort((a, b) => b[1] - a[1]);
  const top = totals[0];
  const answers = shown.reduce((n, t) => n + t.answers, 0);
  const weakest = shown[0];
  const strongest = shown.at(-1);

  const takeaways: Insight[] = [];
  if (weakest && weakest.masteryPct < 70) {
    takeaways.push({ icon: 'target', title: `Prioritise ${weakest.topic} in ${weakest.className}`, text: `Only ${weakest.masteryPct}% mastery across ${weakest.answers} answered questions.` });
  }
  if (top && top[1] > 0) {
    takeaways.push({ icon: 'alert', title: `${MISTAKES[top[0]].label} is the biggest leak`, text: `${top[1]} of the mistakes tagged so far. ${MISTAKES[top[0]].hint}.` });
  }
  if (strongest && strongest !== weakest && strongest.masteryPct >= 75) {
    takeaways.push({ icon: 'star', title: `${strongest.topic} is secure`, text: `${strongest.masteryPct}% mastery in ${strongest.className}.` });
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Icon name="spark" />
            Only in PaperPeer
          </>
        }
        title="Mistake Map"
        sub="Not just who scored low, but which ideas a class is missing, and why marks were lost."
        actions={
          classes.length > 1 && (
            <select
              aria-label="Class"
              value={shownClass}
              onChange={(e) => {
                store.set('insightClass', e.target.value);
                setPicked(e.target.value);
              }}
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )
        }
      />
      {topics.length ? (
        <>
          <div className="kpis">
            <Kpi label="Topics tracked" value={shown.length} foot={`${answers} question answers analysed`} icon="layers" />
            <Kpi
              label="Weakest topic"
              text={!!weakest}
              value={weakest ? weakest.topic : '–'}
              foot={weakest ? `${weakest.masteryPct}% mastery · ${weakest.className}` : ''}
              footTone="down"
              icon="target"
            />
            <Kpi
              label="Top mistake"
              text={!!top?.[1]}
              value={top?.[1] ? MISTAKES[top[0]].label : '–'}
              foot={top?.[1] ? `${top[1]} times` : 'None tagged yet'}
              icon="alert"
            />
            <Kpi label="Students to check in on" value={watchlist.length} foot="Average below 60%" footTone={watchlist.length ? 'down' : 'up'} icon="people" />
          </div>
          <section className="card gap-below">
            <div className="card-header">
              <div>
                <h2>Topic × mistake</h2>
                <p>Weakest topics first. Each cell counts answers that lost marks for that reason.</p>
              </div>
            </div>
            <div className="card-body">
              <MistakeMatrix
                scoreLabel="Mastery"
                rows={shown.map((t) => ({ title: t.topic, sub: `${t.subject} · ${t.className}`, scorePct: t.masteryPct, total: t.answers, mistakes: t.mistakes }))}
              />
            </div>
          </section>
          <div className="grid cols-2">
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>What to do next</h2>
                  <p>Generated from the map</p>
                </div>
                <Icon name="spark" />
              </div>
              <div className="card-body">
                {takeaways.length ? <InsightList items={takeaways} /> : <p className="muted small">Keep marking by question to see recommendations.</p>}
              </div>
            </section>
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Check in with</h2>
                  <p>Lowest averages across all exams</p>
                </div>
              </div>
              {watchlist.length ? (
                <div className="list">
                  {watchlist.map((w) => (
                    <div className="list-item" key={w.id}>
                      <Avatar name={w.name} />
                      <div className="main-col">
                        <b>{w.name}</b>
                        <span>
                          {w.className || 'No class'} · {w.exams} exam{w.exams === 1 ? '' : 's'}
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
                  <p className="small muted">No one is below 60%.</p>
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <>
          <section className="card">
            <Empty
              icon="map"
              title="Your Mistake Map starts with one exam"
              text="Split an exam into questions, give each a topic, and tag the mistake when you mark. Topics then roll up across every exam and class."
              action={
                <a className="btn primary" href="#/exams/new">
                  <Icon name="plus" />
                  Create an exam with questions
                </a>
              }
            />
          </section>
          <div className="grid cols-3 gap-above">
            <Callout tone="brand" icon="layers" title="Per question">
              See which question sank the class average.
            </Callout>
            <Callout tone="brand" icon="alert" title="Per mistake type">
              Concept gap or careless slip? They need different fixes.
            </Callout>
            <Callout tone="brand" icon="bridge" title="Peer Bridge">
              Students get pointed to a classmate who nailed the question they missed.
            </Callout>
          </div>
        </>
      )}
    </>
  );
}

export function InsightsPage() {
  const load = useApi<SchoolInsights>('/insights');
  return (
    <Page load={load} active="insights" title="Mistake Map">
      {(data) => <MistakeMapView {...data} />}
    </Page>
  );
}
