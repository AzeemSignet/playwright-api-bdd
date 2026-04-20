/**
 * OAuth token helper (client credentials) with caching.
 */
import { request } from '@playwright/test';
import { ENV } from '../config/env.js';
import { log } from './logger.js';

type OAuthTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

type CachedToken = {
  accessToken: string;
  tokenType: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;
const CLOCK_SKEW_MS = 30_000;

function isOAuthConfigured(): boolean {
  return Boolean(ENV.oauthTokenUrl && ENV.oauthClientId && ENV.oauthClientSecret);
}

function isMockTokenUrl(tokenUrl: string): boolean {
  if (!tokenUrl) return false;
  const normalized = tokenUrl.trim().toLowerCase();
  return normalized.startsWith('mock:') || normalized.startsWith('demo:') || normalized === 'mock';
}

function parseExtraParams(raw: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, String(value)])
      );
    }
  } catch {
    // ignore JSON parse failure
  }

  // Fallback: key1=value1&key2=value2
  return Object.fromEntries(
    raw
      .split('&')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [k, v = ''] = pair.split('=');
        if (!k) return ['', ''];
        return [decodeURIComponent(k), decodeURIComponent(v)];
      })
      .filter(([key]) => key)
  );
}

async function fetchOAuthToken(): Promise<CachedToken> {
  if (!isOAuthConfigured()) {
    throw new Error('OAuth is not configured. Set OAUTH_TOKEN_URL, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET.');
  }

  const form: Record<string, string> = {
    grant_type: ENV.oauthGrantType || 'client_credentials',
    client_id: ENV.oauthClientId,
    client_secret: ENV.oauthClientSecret
  };

  if (ENV.oauthScope) form.scope = ENV.oauthScope;
  if (ENV.oauthAudience) form.audience = ENV.oauthAudience;

  const extraParams = parseExtraParams(ENV.oauthExtraParams);
  Object.assign(form, extraParams);

  const context = await request.newContext({ ignoreHTTPSErrors: true });

  try {
    log(`Fetching OAuth token from ${ENV.oauthTokenUrl}`, 'INFO');

    const response = await context.post(ENV.oauthTokenUrl, {
      form,
      headers: {
        Accept: 'application/json'
      }
    });

    const status = response.status();
    const bodyText = await response.text();

    if (status < 200 || status >= 300) {
      throw new Error(`OAuth token request failed (${status}): ${bodyText}`);
    }

    let payload: OAuthTokenResponse;
    try {
      payload = JSON.parse(bodyText) as OAuthTokenResponse;
    } catch {
      throw new Error(`OAuth token response is not JSON: ${bodyText}`);
    }

    if (!payload.access_token) {
      throw new Error('OAuth token response missing access_token');
    }

    const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
    const tokenType = payload.token_type || 'Bearer';

    return {
      accessToken: payload.access_token,
      tokenType,
      expiresAt: Date.now() + expiresIn * 1000 - CLOCK_SKEW_MS
    };
  } finally {
    await context.dispose();
  }
}

export async function getOAuthAuthorizationHeader(): Promise<string | null> {
  if (!isOAuthConfigured()) return null;

  if (isMockTokenUrl(ENV.oauthTokenUrl)) {
    return 'Bearer demo-access-token';
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return `${cachedToken.tokenType} ${cachedToken.accessToken}`;
  }

  cachedToken = await fetchOAuthToken();
  return `${cachedToken.tokenType} ${cachedToken.accessToken}`;
}
