/**
 * Step definitions for sample API authentication and response checks.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { ApiClient } from '../utils/apiClient.js';
import { sendRequest } from '../utils/requestHelper.js';
import { getResponse, setResponse } from '../utils/httpHelper.js';
import { logResponse } from '../utils/httpHelper.js';

let response: any;
let context: any;
let requestBody: any;

/**
 * Initialize API context with authentication.
 *
 * @example
 * Given API authentication header is present
 */
Given('API authentication header is present', async function () {
  context = await ApiClient.getContext();
});


/**
 * Send a request with a fixed login payload.
 *
 * @example
 * When I send a "POST" request to "/login" with request body1
 */
 When('I send a {string} request to {string} with request body1', async function (method: string, endpoint: string) {
   requestBody = {"username": "sailajak", "password": "Sailaja1234"};
   response = await sendRequest(context, method, endpoint, requestBody);
 });


/**
 * Assert response status is 2xx.
 *
 * @example
 * Then response status should be 2xx
 */
Then('response status should be 2xx', async function () {
           if (!response) throw new Error('No response available');
           expect(response.status()).to.be.within(200, 299);
});