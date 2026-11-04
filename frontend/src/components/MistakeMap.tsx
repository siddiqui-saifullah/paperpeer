import type { Mistake, MistakeCounts, QuestionInsight } from '../lib/types';
import { Icon, type IconName } from './Icon';
import { MISTAKE_KEYS, MISTAKES } from './kit';

// The Mistake Map: for each question (or topic), how well the class did and which
// kinds of mistakes cost them marks. Colours come from classes, never inline styles.

export const heatClass = (p: number | null) => (p === null ? 'none' : p < 50 ? 'h0' : p < 60 ? 'h1' : p < 70 ? 'h2' : p < 85 ? 'h3' : 'h4');

const level = (count: number, total: number) => {
  if (!count || !total) return 'l0';
  const share = count / total;
  return share < 0.15 ? 'l1' : share < 0.3 ? 'l2' : share < 0.5 ? 'l3' : 'l4';
};

export interface MatrixRow {
  title: string;
  sub?: string;
  scorePct: number | null;
  total: number;
  mistakes: MistakeCounts;
}

export function MistakeMatrix({ rows, scoreLabel = 'Avg score' }: { rows: MatrixRow[]; scoreLabel?: string }) {
  return (
    <>
      <div className="table-wrap">
        <table className="heatmap">
          <thead>
            <tr>
              <th />
              <th>{scoreLabel}</th>
              {MISTAKE_KEYS.map((key) => (
                <th key={key} title={MISTAKES[key].hint}>
                  <span className={`mistake m-${key}`}>
                    <i />
                    {MISTAKES[key].label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.title}-${r.sub}-${i}`}>
                <th scope="row">
                  <b className="small">{r.title}</b>
                  {r.sub && <div className="tiny faint">{r.sub}</div>}
                </th>
                <td>
                  <div className={`heat ${heatClass(r.scorePct)}`}>{r.scorePct === null ? '–' : `${r.scorePct}%`}</div>
                </td>
                {MISTAKE_KEYS.map((key) => (
                  <td key={key}>
                    <div className={`mcell m-${key} ${level(r.mistakes[key], r.total)}`} title={`${r.mistakes[key]} of ${r.total}`}>
                      {r.mistakes[key] || '·'}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend gap-above">
        <span>
          <i className="sw h0" />
          Below 50%
        </span>
        <span>
          <i className="sw h2" />
          50–69%
        </span>
        <span>
          <i className="sw h3" />
          70–84%
        </span>
        <span>
          <i className="sw h4" />
          85%+
        </span>
        <span className="legend-note">Darker mistake cells mean more of the class made that mistake.</span>
      </div>
    </>
  );
}

/** Average score per question as a bar chart. */
export function QuestionChart({ questions }: { questions: QuestionInsight[] }) {
  const scored = questions.filter((q) => q.averagePct !== null);
  if (!scored.length) return null;
  const [w, h, left, bottom, top] = [640, 200, 36, 26, 16];
  const slot = (w - left) / scored.length;
  const barW = Math.min(46, slot * 0.6);
  const y = (v: number) => top + ((100 - v) * (h - top - bottom)) / 100;
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Average score per question">
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line className="grid" x1={left} x2={w} y1={y(v)} y2={y(v)} />
          <text className="axis" x={left - 8} y={y(v) + 4} textAnchor="end">
            {v}%
          </text>
        </g>
      ))}
      {scored.map((q, i) => {
        const avg = q.averagePct ?? 0;
        const x = left + i * slot + (slot - barW) / 2;
        const tone = avg < 50 ? 'low' : avg < 70 ? 'mid' : '';
        return (
          <g key={q.id}>
            <title>{`${q.label}${q.topic ? ` · ${q.topic}` : ''}: ${avg}% average`}</title>
            <rect className={`bar-q ${tone}`} x={x.toFixed(1)} y={y(avg).toFixed(1)} width={barW.toFixed(1)} height={(y(0) - y(avg)).toFixed(1)} rx="5" />
            <text className="bar-value" x={(x + barW / 2).toFixed(1)} y={(y(avg) - 6).toFixed(1)} textAnchor="middle">
              {avg}%
            </text>
            <text className="bar-label" x={(x + barW / 2).toFixed(1)} y={h - 8} textAnchor="middle">
              {q.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface Insight {
  icon: IconName;
  title: string;
  text: string;
}

const ADVICE: Record<Mistake, string> = {
  concept: 'Revisit the idea itself before more practice.',
  calculation: 'Method is fine. Add a quick check-your-working routine.',
  misread: 'Practise underlining what each question actually asks.',
  incomplete: 'Show a model answer with every step written out.',
  unattempted: 'Look at timing, or whether the paper was too long.',
};

/** Plain-language takeaways a teacher can act on in the next lesson. */
export function reteach(questions: QuestionInsight[]): Insight[] {
  const scored = questions.filter((q) => q.scored > 0);
  if (!scored.length) return [];
  const out: Insight[] = [];
  const byAvg = [...scored].sort((a, b) => (a.averagePct ?? 0) - (b.averagePct ?? 0));
  const worst = byAvg[0]!;
  if ((worst.averagePct ?? 0) < 70) {
    out.push({
      icon: 'target',
      title: `Reteach ${worst.label}${worst.topic ? ` (${worst.topic})` : ''}`,
      text: `The class averaged ${worst.averagePct}%. Only ${worst.fullMarks} of ${worst.scored} got full marks.`,
    });
  }
  const totals = MISTAKE_KEYS.map((k) => [k, scored.reduce((n, q) => n + q.mistakes[k], 0)] as const).sort((a, b) => b[1] - a[1]);
  const [topKey, topCount] = totals[0]!;
  if (topCount > 0) {
    const where = scored.filter((q) => q.mistakes[topKey] > 0).map((q) => q.label).join(', ');
    out.push({ icon: 'alert', title: `Most common: ${MISTAKES[topKey].label.toLowerCase()} (${topCount}×)`, text: `Seen in ${where}. ${ADVICE[topKey]}` });
  }
  const best = byAvg.at(-1)!;
  if (best !== worst && (best.averagePct ?? 0) >= 75) {
    out.push({ icon: 'star', title: `${best.label} is secure`, text: `${best.averagePct}% average. Move on from ${best.topic || 'this'} with confidence.` });
  }
  return out;
}

export function InsightList({ items }: { items: Insight[] }) {
  return (
    <div className="stack tight">
      {items.map((i) => (
        <div className="insight" key={i.title}>
          <span className="ic">
            <Icon name={i.icon} />
          </span>
          <div>
            <b>{i.title}</b>
            <p>{i.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
