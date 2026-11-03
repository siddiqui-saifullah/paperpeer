import { me } from '../core/session.js';
import { html } from '../core/html.js';
import { callout } from './kit.js';
import { icon } from './icons.js';

export function credentialsTable(created) {
  return html`
    <div class="no-print">${callout('warn', 'alert', 'Print or save these now', 'First passwords are shown only once. Everyone sets their own password at first sign-in.')}</div>
    <div class="table-wrap gap-above">
      <table>
        <thead><tr><th>Name</th><th>School code</th><th>Username</th><th>First password</th></tr></thead>
        <tbody>
          ${created.map((c) => html`<tr><td>${c.name}</td><td>${me.school.code}</td><td><code>${c.username}</code></td><td><code>${c.tempPassword}</code></td></tr>`)}
        </tbody>
      </table>
    </div>
    <div class="row no-print gap-above"><button class="btn primary" type="button" id="print">${icon('printer')}Print login slips</button></div>`;
}
