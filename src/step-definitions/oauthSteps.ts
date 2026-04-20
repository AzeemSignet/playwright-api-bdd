/**
 * Step definitions for OAuth token demo validation.
 */
import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from 'chai';
import { ENV } from '../config/env.js';
import { getOAuthAuthorizationHeader } from '../utils/oauthTokenHelper.js';

/**
 * Configure OAuth client credentials (optionally from a data table).
 * Populates ENV and process.env so downstream helpers can read them.
 *
 * @example
 * Given OAuth client credentials are configured
 *   | OAUTH_TOKEN_URL     | https://auth.example.com/oauth/token |
 *   | OAUTH_CLIENT_ID     | demo-client-id                       |
 *   | OAUTH_CLIENT_SECRET | demo-client-secret                   |
 */
Given('OAuth client credentials are configured', async function (dataTable?: DataTable) {
  if (dataTable) {
    const rows = dataTable.rowsHash();
    const tokenUrl = rows.OAUTH_TOKEN_URL || rows.oauth_token_url;
    const clientId = rows.OAUTH_CLIENT_ID || rows.oauth_client_id;
    const clientSecret = rows.OAUTH_CLIENT_SECRET || rows.oauth_client_secret;
    const scope = rows.OAUTH_SCOPE || rows.oauth_scope;
    const audience = rows.OAUTH_AUDIENCE || rows.oauth_audience;
    const grantType = rows.OAUTH_GRANT_TYPE || rows.oauth_grant_type;
    const extraParams = rows.OAUTH_EXTRA_PARAMS || rows.oauth_extra_params;

    if (tokenUrl) {
      process.env.OAUTH_TOKEN_URL = tokenUrl;
      ENV.oauthTokenUrl = tokenUrl;
    }
    if (clientId) {
      process.env.OAUTH_CLIENT_ID = clientId;
      ENV.oauthClientId = clientId;
    }
    if (clientSecret) {
      process.env.OAUTH_CLIENT_SECRET = clientSecret;
      ENV.oauthClientSecret = clientSecret;
    }
    if (scope) {
      process.env.OAUTH_SCOPE = scope;
      ENV.oauthScope = scope;
    }
    if (audience) {
      process.env.OAUTH_AUDIENCE = audience;
      ENV.oauthAudience = audience;
    }
    if (grantType) {
      process.env.OAUTH_GRANT_TYPE = grantType;
      ENV.oauthGrantType = grantType;
    }
    if (extraParams) {
      process.env.OAUTH_EXTRA_PARAMS = extraParams;
      ENV.oauthExtraParams = extraParams;
    }
  }

  if (!ENV.oauthTokenUrl || !ENV.oauthClientId || !ENV.oauthClientSecret) {
    throw new Error('OAuth is not configured. Set OAUTH_TOKEN_URL, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET.');
  }
});

/**
 * Request an OAuth token (uses mock token when token URL is mock/demo).
 * Calls getOAuthAuthorizationHeader() when not using a mock token URL.
 *
 * @example
 * When I request an OAuth token
 */
When('I request an OAuth token', async function () {
  const tokenUrl = ENV.oauthTokenUrl || '';
  const isMock = /^mock:/i.test(tokenUrl) || /^demo:/i.test(tokenUrl) || tokenUrl === 'mock';
  if (isMock) {
    (this as any).oauthHeader = 'Bearer demo-access-token';
    return;
  }
  const header = await getOAuthAuthorizationHeader();
  (this as any).oauthHeader = header;
});

/**
 * Assert a valid OAuth Authorization header is returned.
 *
 * @example
 * Then OAuth authorization header should be returned
 */
Then('OAuth authorization header should be returned', async function () {
  const header = (this as any).oauthHeader as string | null | undefined;
  expect(header, 'Expected OAuth authorization header to be returned').to.be.a('string');
  if (!header) return;
  const [scheme, token] = header.split(' ');
  expect(scheme, 'Expected Bearer scheme in OAuth header').to.match(/^Bearer$/i);
  expect(token, 'Expected non-empty OAuth access token').to.be.a('string').and.not.empty;
});
