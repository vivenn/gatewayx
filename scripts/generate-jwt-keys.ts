// Dev/test helper: generates an RSA keypair for RS256 JWT signing, since the
// gateway only ever verifies (never signs) tokens in production — this
// script stands in for "the Auth Service's key material" during local
// development and in tests. Run with `npm run keys:generate`.
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// eslint-disable-next-line no-console
console.log('--- PRIVATE KEY (give to a mock Auth Service / test signer only) ---');
// eslint-disable-next-line no-console
console.log(privateKey);
// eslint-disable-next-line no-console
console.log('--- PUBLIC KEY (put this in .env as JWT_PUBLIC_KEY) ---');
// eslint-disable-next-line no-console
console.log(publicKey);
