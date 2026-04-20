/**
 * Creates a Playwright API request context with optional default headers.
 */
import { request } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { ENV } from '../config/env.js';

export class ApiClient {
  static async getContext(
    options: {
      headers?: Record<string, string>;
    } = {}
  ): Promise<APIRequestContext> {
    const headers = options.headers;

    return await request.newContext({
      baseURL: ENV.baseUrl,
      ...(headers ? { extraHTTPHeaders: headers } : {})
    });
  }
}