// Lets any page ask for a redraw without importing the router, which imports
// every page. `renderId` lets a slow page notice a newer navigation and stop.
export let renderId = 0;
let renderer = () => {};

export const setRenderer = (fn) => { renderer = fn; };
export const nextRender = () => ++renderId;
export const render = () => renderer();
