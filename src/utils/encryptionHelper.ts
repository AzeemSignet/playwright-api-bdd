/**
 * Encryption/decryption helper for API validation payloads.
 * Uses AES-256-GCM with a shared secret key.
 */
import crypto from 'crypto';
import { ENV } from '../config/env.js';

const DEFAULT_ALGORITHM = 'aes-256-gcm';
const DEFAULT_KEY_ENCODING: BufferEncoding = 'base64';
const IV_LENGTH = 12; // 96-bit nonce for GCM

type EncryptionOptions = {
  key?: string;
  keyEncoding?: BufferEncoding;
  algorithm?: string;
};

function getKeyBuffer(options?: EncryptionOptions): Buffer {
  const key = options?.key ?? ENV.encryptionKey;
  if (!key) {
    throw new Error('Encryption key not configured. Set ENCRYPTION_KEY.');
  }

  const encoding = (options?.keyEncoding ?? (ENV.encryptionKeyEncoding as BufferEncoding) ?? DEFAULT_KEY_ENCODING) as BufferEncoding;
  const keyBuffer = Buffer.from(key, encoding);

  if (keyBuffer.length !== 32) {
    throw new Error(`Encryption key must be 32 bytes for AES-256-GCM. Current length: ${keyBuffer.length}`);
  }

  return keyBuffer;
}

function getAlgorithm(options?: EncryptionOptions): string {
  return options?.algorithm ?? ENV.encryptionAlgorithm ?? DEFAULT_ALGORITHM;
}

export function encryptText(plainText: string, options?: EncryptionOptions): string {
  const key = getKeyBuffer(options);
  const algorithm = getAlgorithm(options);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(algorithm, key, iv) as crypto.CipherGCM;

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: base64(iv):base64(tag):base64(ciphertext)
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptText(payload: string, options?: EncryptionOptions): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Encrypted payload format invalid. Expected iv:tag:ciphertext');
  }

  const key = getKeyBuffer(options);
  const algorithm = getAlgorithm(options);

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv(algorithm, key, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
