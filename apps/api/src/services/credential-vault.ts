import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { environment } from '../config/environment.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DERIVED_KEY_LENGTH = 32;

export interface CredentialContext {
  userId: string;
  providerId: string;
  label: string;
}

export interface EncryptedCredential {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function deriveUserKey(userId: string, keyVersion: number): Buffer {
  const masterKey = Buffer.from(environment.VAULT_MASTER_KEY, 'base64');
  const info = Buffer.from(`credential:v${keyVersion}:user:${userId}`, 'utf-8');
  return Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), info, DERIVED_KEY_LENGTH));
}

function buildAad(context: CredentialContext): Buffer {
  return Buffer.from(`${context.userId}:${context.providerId}:${context.label}`, 'utf-8');
}

export function encryptCredential(apiKey: string, context: CredentialContext): EncryptedCredential {
  const key = deriveUserKey(context.userId, 1);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  cipher.setAAD(buildAad(context));

  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf-8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: 1,
  };
}

export function decryptCredential(credential: EncryptedCredential, context: CredentialContext): string {
  const key = deriveUserKey(context.userId, credential.keyVersion);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(credential.iv, 'base64'), {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAAD(buildAad(context));
  decipher.setAuthTag(Buffer.from(credential.authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(credential.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf-8');
}
