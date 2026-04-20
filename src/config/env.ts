/**
 * Centralized environment variable loader for base URL and auth token.
 */
import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  // Accept common environment variable casings and fall back to defaults
  baseUrl: process.env.BASE_URL || process.env.BASE_url || process.env.BASE_url1 || process.env.BASE_url1 || 'http://localhost:3000',
  token: process.env.BEARER_TOKEN || process.env.TOKEN || '',
  oauthTokenUrl: process.env.OAUTH_TOKEN_URL || process.env.oauth_token_url || '',
  oauthClientId: process.env.OAUTH_CLIENT_ID || process.env.oauth_client_id || '',
  oauthClientSecret: process.env.OAUTH_CLIENT_SECRET || process.env.oauth_client_secret || '',
  oauthScope: process.env.OAUTH_SCOPE || process.env.oauth_scope || '',
  oauthAudience: process.env.OAUTH_AUDIENCE || process.env.oauth_audience || '',
  oauthGrantType: process.env.OAUTH_GRANT_TYPE || process.env.oauth_grant_type || 'client_credentials',
  oauthExtraParams: process.env.OAUTH_EXTRA_PARAMS || process.env.oauth_extra_params || '',
  encryptionKey: process.env.ENCRYPTION_KEY || process.env.encryption_key || '',
  encryptionKeyEncoding: process.env.ENCRYPTION_KEY_ENCODING || process.env.encryption_key_encoding || 'base64',
  encryptionAlgorithm: process.env.ENCRYPTION_ALGORITHM || process.env.encryption_algorithm || 'aes-256-gcm',
  encryptionEnabled: process.env.ENCRYPTION_ENABLED || process.env.encryption_enabled || '',
  clearCachePerFeature: process.env.CLEAR_CACHE_PER_FEATURE || process.env.clear_cache_per_feature || ''
};