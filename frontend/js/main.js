import { root, store } from './core/ui.js';
import { loadMe } from './core/session.js';
import { render, setRenderer } from './core/view.js';
import { renderRoute } from './router.js';

// Applied before the first paint, so a saved theme never flashes the other one.
if (store.get('theme')) document.documentElement.dataset.theme = store.get('theme');

setRenderer(renderRoute);

window.addEventListener('hashchange', async () => {
  await render();
  scrollTo(0, 0);
  (root.querySelector('[autofocus]') || root.querySelector('main'))?.focus({ preventScroll: true });
});

await loadMe();
render();
