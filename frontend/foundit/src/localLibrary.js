const DATABASE_NAME = 'wheres-that-reel';
const DATABASE_VERSION = 1;
const ACCOUNT_STORE = 'accounts';
const REEL_STORE = 'reels';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore(ACCOUNT_STORE, { keyPath: 'username' });
      const reels = database.createObjectStore(REEL_STORE, { keyPath: ['username', 'url'] });
      reels.createIndex('username', 'username', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
  const key = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
  return toHex(bits);
}

export async function createAccount(username, password) {
  const database = await openDatabase();
  const normalizedUsername = username.trim().toLowerCase();
  const existing = await requestResult(database.transaction(ACCOUNT_STORE).objectStore(ACCOUNT_STORE).get(normalizedUsername));
  if (existing) {
    database.close();
    throw new Error('An account with that username already exists on this device.');
  }

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const account = { username: normalizedUsername, salt: toHex(salt), passwordHash: await hashPassword(password, salt) };
  await requestResult(database.transaction(ACCOUNT_STORE, 'readwrite').objectStore(ACCOUNT_STORE).add(account));
  database.close();
  return normalizedUsername;
}

export async function signIn(username, password) {
  const database = await openDatabase();
  const normalizedUsername = username.trim().toLowerCase();
  const account = await requestResult(database.transaction(ACCOUNT_STORE).objectStore(ACCOUNT_STORE).get(normalizedUsername));
  database.close();
  if (!account) throw new Error('No account with that username exists on this device.');

  const salt = Uint8Array.from(account.salt.match(/.{2}/g), (byte) => parseInt(byte, 16));
  if (await hashPassword(password, salt) !== account.passwordHash) throw new Error('Incorrect password.');
  return normalizedUsername;
}

export async function getReels(username) {
  const database = await openDatabase();
  const reels = await requestResult(database.transaction(REEL_STORE).objectStore(REEL_STORE).index('username').getAll(username));
  database.close();
  return reels;
}

export async function saveReel(username, reel) {
  const database = await openDatabase();
  await requestResult(database.transaction(REEL_STORE, 'readwrite').objectStore(REEL_STORE).put({ ...reel, username }));
  database.close();
}

export async function deleteReel(username, url) {
  const database = await openDatabase();
  await requestResult(database.transaction(REEL_STORE, 'readwrite').objectStore(REEL_STORE).delete([username, url]));
  database.close();
}

export function rankReels(reels, queryVector, topK = 3) {
  const magnitude = Math.sqrt(queryVector.reduce((total, value) => total + value * value, 0));
  if (!magnitude) return [];

  return reels
    .filter((reel) => Array.isArray(reel.embedding) && reel.embedding.length === queryVector.length)
    .map((reel) => {
      const reelMagnitude = Math.sqrt(reel.embedding.reduce((total, value) => total + value * value, 0));
      const dotProduct = reel.embedding.reduce((total, value, index) => total + value * queryVector[index], 0);
      return { ...reel, score: reelMagnitude ? dotProduct / (reelMagnitude * magnitude) : 0 };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}