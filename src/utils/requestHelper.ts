/**
 * Thin wrapper to send HTTP requests through a Playwright APIRequestContext.
 */
import type { APIRequestContext } from '@playwright/test';

export async function sendRequest(
  context: APIRequestContext,
  method: string,
  endpoint: string,
  body?: any,
  options?: { headers?: Record<string, string> }
) {
  const headers = options?.headers;
  switch (method.toUpperCase()) {
    case 'GET':
      return await context.get(endpoint, headers ? { headers } : undefined);
    case 'POST':
      return await context.post(endpoint, headers ? { data: body, headers } : { data: body });
    case 'PUT':
      return await context.put(endpoint, headers ? { data: body, headers } : { data: body });
    case 'DELETE':
      return await context.delete(endpoint, headers ? { headers } : undefined);
    default:
      throw new Error('Invalid HTTP Method');
  }
}