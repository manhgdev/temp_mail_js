import { randomInt } from 'node:crypto';
import {
  ADJECTIVES,
  FIRST_NAMES,
  LAST_NAMES,
  NOUNS,
  REALISTIC_SUFFIXES
} from './username-data.js';

const pick = (items) => items[randomInt(items.length)];

const buildNumericTail = () => {
  const roll = randomInt(100);

  if (roll < 25) {
    return '';
  }

  if (roll < 55) {
    return String(randomInt(10, 100));
  }

  if (roll < 85) {
    return String(randomInt(100, 10000));
  }

  return String(randomInt(1980, 2025));
};

const truncateLast = (last) => last.slice(0, randomInt(3, Math.min(last.length, 7)));

export const generateUsername = () => {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const pattern = randomInt(100);

  if (pattern < 42) {
    return `${first}${last}${buildNumericTail()}`;
  }

  if (pattern < 60) {
    return `${first}${pick(FIRST_NAMES)}${buildNumericTail()}`;
  }

  if (pattern < 72) {
    return `${first}${truncateLast(last)}${buildNumericTail()}`;
  }

  if (pattern < 84) {
    return `${pick(ADJECTIVES)}${pick(NOUNS)}${buildNumericTail()}`;
  }

  if (pattern < 93) {
    return `${pick(ADJECTIVES)}${first}${buildNumericTail()}`;
  }

  return `${first}${last}${pick(REALISTIC_SUFFIXES)}${buildNumericTail()}`;
};
