import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicJwk = publicKey.export({ format: 'jwk' });
const privateJwk = privateKey.export({ format: 'jwk' });

const rawPublic = Buffer.concat([Buffer.from([4]), Buffer.from(publicJwk.x, 'base64url'), Buffer.from(publicJwk.y, 'base64url')]);

console.log('VAPID_PUBLIC_KEY:');
console.log(rawPublic.toString('base64url'));
console.log('');
console.log('VAPID_PRIVATE_KEY (secret, keep out of git):');
console.log(privateJwk.d);
