import { api } from './api.js';

// The logged-in user. `me` is a live binding, so importers always see the latest.
export let me = null;

export async function loadMe() {
  try {
    me = (await api('/me')).user;
  } catch {
    me = null;
  }
}

export const clearSession = () => { me = null; };
export const isStaff = () => me && me.role !== 'student';
