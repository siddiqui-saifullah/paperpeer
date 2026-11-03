import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const actual = await scrypt(password, Buffer.from(salt, 'hex'), 32);
  return crypto.timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

// Verified against when the account does not exist, so response time does not
// reveal which usernames are real.
export const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString('hex'));

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const randomId = () => crypto.randomBytes(12).toString('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');

// No 0/O or 1/l/I: these get read out and copied by hand from a printed list.
export function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}
