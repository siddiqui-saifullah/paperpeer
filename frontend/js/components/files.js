import { api } from '../core/api.js';
import { html } from '../core/html.js';
import { act, ask, on, root, toast } from '../core/ui.js';
import { render } from '../core/view.js';
import { icon } from './icons.js';

// Redrawing a phone photo shrinks the upload and drops its metadata, including
// GPS location, before a classmate could ever download it.
// Large PNG or WEBP images (screenshots, scans) are turned into JPEGs too.
async function preparePhoto(file) {
  const bigImage = /^image\/(png|webp)$/.test(file.type) && file.size > 1.5 * 1024 * 1024;
  if (file.type !== 'image/jpeg' && !bigImage) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    const name = file.type === 'image/jpeg' ? file.name : file.name.replace(/\.\w+$/, '') + '.jpg';
    return blob ? new File([blob], name, { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

export async function buildForm(files) {
  const form = new FormData();
  for (const file of await Promise.all([...files].map(preparePhoto))) form.append('files', file);
  return form;
}

export const fileUrl = (file, download) => `/api/files/${encodeURIComponent(file.id)}${download ? '?download=1' : ''}`;

export function fileList(files, { removable = false } = {}) {
  if (!files.length) return html`<p class="muted small">Nothing uploaded yet.</p>`;
  return html`<ul class="file-list">
    ${files.map(
      (f) => html`<li>
        <a href="${fileUrl(f)}" target="_blank" rel="noopener">
          ${f.mime.startsWith('image/')
            ? html`<img class="thumb" src="${fileUrl(f)}" alt="" loading="lazy" />`
            : html`<span class="file-icon">PDF</span>`}
          <span>${f.name}</span>
        </a>
        ${removable && html`<button class="btn sm ghost danger" type="button" data-delete-file="${f.id}" aria-label="Remove ${f.name}">Remove</button>`}
      </li>`,
    )}
  </ul>`;
}

// Most phone browsers cannot draw a PDF inside an iframe, so phones get a link.
const inlinePdf = () => !matchMedia('(pointer: coarse)').matches;

export function viewer(files) {
  return html`<div class="viewer">
    ${files.map((f) =>
      f.mime === 'application/pdf'
        ? !inlinePdf()
          ? html`<a class="btn" href="${fileUrl(f)}" target="_blank" rel="noopener">${icon('file')}Open ${f.name}</a>`
          : html`<div>
            <iframe src="${fileUrl(f)}" title="${f.name}" loading="lazy"></iframe>
            <a class="small" href="${fileUrl(f)}" target="_blank" rel="noopener">Open PDF in a new tab</a>
          </div>`
        : html`<a href="${fileUrl(f)}" target="_blank" rel="noopener"><img src="${fileUrl(f)}" alt="${f.name}" loading="lazy" /></a>`,
    )}
  </div>`;
}

export const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

export const dropzone = (id, label) => html`
  <div class="upload" data-drop="${id}">
    <label class="drop">
      <input type="file" multiple accept="${ACCEPT}" />
      ${icon('upload')}<b>${label}</b><span>Drag files here or click to browse · PDF, JPG or PNG · photos are shrunk automatically</span>
    </label>
    <label class="btn camera">${icon('camera')}Take a photo<input class="sr-only" type="file" accept="image/*" capture="environment" /></label>
  </div>`;

export function bindDrop(id, upload) {
  const zone = root.querySelector(`[data-drop="${id}"]`);
  if (!zone) return;
  const send = async (files) => {
    if (!files.length) return;
    const label = zone.querySelector('b');
    const original = label.textContent;
    label.textContent = 'Preparing…';
    try {
      const form = await buildForm(files);
      await upload(form, (share) => {
        label.textContent = `Uploading ${Math.round(share * 100)}%`;
      });
      toast('Uploaded.');
      await render();
    } catch (err) {
      label.textContent = original;
      zone.querySelectorAll('input').forEach((input) => { input.value = ''; });
      toast(err.message, true);
    }
  };
  zone.querySelectorAll('input').forEach((input) => input.addEventListener('change', () => send(input.files)));
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    send(e.dataTransfer.files);
  });
}

export function bindFileDelete() {
  on('[data-delete-file]', 'click', act(async (el) => {
    if (!(await ask('Remove this file?', { confirmLabel: 'Remove', danger: true }))) return;
    await api(`/files/${encodeURIComponent(el.dataset.deleteFile)}`, { method: 'DELETE' });
    return 'File removed.';
  }));
}
