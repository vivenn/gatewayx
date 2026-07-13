// Dev/test helper for benchmarking and manual testing: generates a fresh RSA
// keypair, signs a short-lived RS256 token with it, writes the token to
// token.txt, and rewrites .env's JWT_PUBLIC_KEY to match — so the running
// gateway (after a restart) will accept the printed token. Mirrors
// generate-jwt-keys.ts but automates the .env edit for repeatable local
// load-testing (see README's Performance section). Run with
// `npm run token:generate`, then `docker compose up -d gateway` (or restart
// `npm run dev`) to pick up the new key.
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createSigner } from 'fast-jwt';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const sign = createSigner({
  key: privateKey,
  algorithm: 'RS256',
  iss: 'gatewayx-auth',
  expiresIn: 3_600_000,
});
const token = await sign({ sub: 'test-user' });
writeFileSync('token.txt', token);

const env = readFileSync('.env', 'utf8');
const escapedKey = publicKey.replace(/\n/g, '\\n');
const updatedEnv = env.replace(/JWT_PUBLIC_KEY="[^"]+"/, `JWT_PUBLIC_KEY="${escapedKey}"`);
writeFileSync('.env', updatedEnv);

// eslint-disable-next-line no-console
console.log('Wrote a 1-hour token to token.txt and updated .env\'s JWT_PUBLIC_KEY to match.');
// eslint-disable-next-line no-console
console.log('Restart the gateway (docker compose up -d gateway, or npm run dev) to pick up the new key.');
