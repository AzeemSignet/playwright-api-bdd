# Project documentation (simple and crisp)

## Overview
This repository runs API tests using Cucumber + Playwright and provides a small dashboard to run tests, view summaries, and download reports.

## How the system works
1) Feature files define scenarios in Gherkin.
2) Step definitions implement those steps in TypeScript.
3) Utilities handle HTTP requests, validation, logging, and helpers.
4) Cucumber executes scenarios and writes HTML/JSON reports to test-reports.
5) The dashboard reads those reports and shows a summary UI.
6) The Excel generator converts the latest cucumber JSON report to a .xlsx report.

## Commands (from package.json)
- Run tests: npm test
- Run validation script: npm run test:validation
- Run dashboard: npm run dashboard

## File-by-file summary

### Root
- [package.json](package.json): Project metadata and scripts for tests, validation, and dashboard.
- [package-lock.json](package-lock.json): Locked dependency versions.
- [tsconfig.json](tsconfig.json): TypeScript compiler settings for step definitions and utilities.
- [runtest.bat](runtest.bat): Windows batch script to run Cucumber with reports.
- [cucumber.cjs](cucumber.cjs): Default Cucumber config for CLI runs (paths, reports).
- [cucumber.dashboard.cjs](cucumber.dashboard.cjs): Dashboard Cucumber config (features passed dynamically).
- [dashboard.js](dashboard.js): Express server for the dashboard UI, report summary endpoints, and run trigger.
- [generate-excel-report.js](generate-excel-report.js): Builds a timestamped Excel report from cucumber-report.json.
- [ARCHITECTURE.md](ARCHITECTURE.md): High-level architecture notes.
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md): Implementation highlights.
- [LOGGING.md](LOGGING.md): Logging strategy and format.
- [QUICKSTART.md](QUICKSTART.md): Quick setup and usage guide.
- [PRODUCER_VALIDATION_GUIDE.md](PRODUCER_VALIDATION_GUIDE.md): Producer validation usage details.
- [VALIDATION.md](VALIDATION.md): Validation system overview.
- [VALIDATION_TEST_GUIDE.md](VALIDATION_TEST_GUIDE.md): Validation test instructions.

### src/config
- [src/config/env.ts](src/config/env.ts): Loads environment variables used for base URL, tokens, OAuth, and encryption settings.

### src/step-definitions
- [src/step-definitions/attributeValidationSteps.ts](src/step-definitions/attributeValidationSteps.ts): CSV attribute validation steps.
- [src/step-definitions/encryptionSteps.ts](src/step-definitions/encryptionSteps.ts): Encryption/decryption demo steps for payload validation.
- [src/step-definitions/producerValidationSteps.ts](src/step-definitions/producerValidationSteps.ts): Producer request validation, reporting, and batch tests.
- [src/step-definitions/sampleapiSteps.ts](src/step-definitions/sampleapiSteps.ts): Simple API auth and status checks.
- [src/step-definitions/stiboapisteps.ts](src/step-definitions/stiboapisteps.ts): Stibo API request flows, base URL overrides, and response assertions.

### src/utils
- [src/utils/apiClient.ts](src/utils/apiClient.ts): Builds Playwright API request context with headers.
- [src/utils/bearerTokenHelper.ts](src/utils/bearerTokenHelper.ts): Extracts Bearer tokens from sessionStorage and supports workspace cleanup calls.
- [src/utils/requestHelper.ts](src/utils/requestHelper.ts): Sends HTTP requests via Playwright context.
- [src/utils/encryptionHelper.ts](src/utils/encryptionHelper.ts): AES-256-GCM encrypt/decrypt helpers for payloads.
- [src/utils/logger.ts](src/utils/logger.ts): Buffered logging to test-reports/execution.log.
- [src/utils/oauthTokenHelper.ts](src/utils/oauthTokenHelper.ts): OAuth client-credentials token retrieval with caching.
- [src/utils/csvValidator.ts](src/utils/csvValidator.ts): CSV parsing and validation helpers.
- [src/utils/httpHelper.ts](src/utils/httpHelper.ts): HTTP request helpers, validation, logging, and response utilities.
- [src/utils/validator.ts](src/utils/validator.ts): XML/JSON conversion, schema validation, and summary output.
- [src/utils/validationSchema.ts](src/utils/validationSchema.ts): Validation schemas and helpers.
- [src/utils/validationTest.ts](src/utils/validationTest.ts): Standalone validation test suite.
- [src/utils/testInvalidXml.ts](src/utils/testInvalidXml.ts): Invalid XML validation demo.
- [src/utils/xmlInspector.ts](src/utils/xmlInspector.ts): Inspects parsed XML structure for schema tuning.

### src/features
- [src/features/producerRequestBodyValidation.feature](src/features/producerRequestBodyValidation.feature): Producer request body validation scenarios.
- [src/features/demoAPI.feature](src/features/demoAPI.feature): Sample API tests.
- [src/features/mockAPI.feature](src/features/mockAPI.feature): Mock auth header echo tests plus encryption and OAuth demos.
- [src/features/stiboCVP.feature](src/features/stiboCVP.feature): CVP producer flow.
- [src/features/stiboProducerStore.feature](src/features/stiboProducerStore.feature): Store producer flow, error and token cases.
- [src/features/validationTest.feature](src/features/validationTest.feature): Invalid-data validation scenario.

### Scenario documentation

#### [src/features/demoAPI.feature](src/features/demoAPI.feature)
- Validate successful API response
- Validate successful API response with token (scenario outline)
- Encrypt and decrypt payload round-trip
- Decrypting invalid payload fails
- Send <mechanism> authentication header to real server (scenario outline)
	- Steps: `base URL is "https://httpbin.org"` -> overrides `ENV.baseUrl` via `setBaseUrl()` in `httpHelper`.

#### [src/features/mockAPI.feature](src/features/mockAPI.feature)
- Send <mechanism> authentication header (scenario outline)
	- Steps: `base URL is "mock://local"` -> overrides `ENV.baseUrl` via `setBaseUrl()` in `httpHelper`.
	- Steps: `API authentication header is "" present` -> `setAuthContext()` in `httpHelper` via `stiboapisteps`.
	- Steps: `I send a "GET" request to "/auth/echo"` -> `sendRequest()` in `httpHelper` via `stiboapisteps`.
	- Steps: `response status should be "2xx"` -> `logResponse()` + `validateStatusRange()` via `stiboapisteps`.
	- Steps: `mock response should include header ...` -> `getResponse()` + `getEchoedHeader()` via `mockAuthSteps`.
- OAuth client credentials header
	- Steps: `OAuth client credentials are configured` -> sets `ENV` and `process.env` in `oauthSteps`.
	- Steps: `I send a "GET" request to "/auth/echo"` -> `sendRequest()` in `httpHelper`.
	- Steps: `mock response should include header "Authorization" ...` -> `getResponse()` + `getEchoedHeader()`.
- Encrypt and decrypt payload round-trip
	- Steps: `I encrypt the payload ...` -> `encryptText()` in `encryptionHelper` via `encryptionSteps`.
	- Steps: `I decrypt the payload ...` -> `decryptText()` in `encryptionHelper` via `encryptionSteps`.
- Decrypting invalid payload fails
	- Steps: `I try to decrypt ...` -> `decryptText()` with error captured in `encryptionSteps`.

#### [src/features/producerRequestBodyValidation.feature](src/features/producerRequestBodyValidation.feature)
- Test producer request body with valid data
- Test producer request body with invalid data variations
- Test producer request body data type validation
- Test producer request body range validation
- Batch test producer request body against API endpoint

#### [src/features/stiboCVP.feature](src/features/stiboCVP.feature)
- Validate successful Stibo Producer API response

#### [src/features/stiboProducerStore.feature](src/features/stiboProducerStore.feature)
- Print request body converted to JSON
- Validate successful Stibo Producer API response
- Validate unsuccessful Stibo Producer API response
- Validate the stibo producer URL incorrect or Malformed
- Validate the stibo producer request body against pre configurable size 256KB
- Validate Stibo Producer API response for Get Method
- Validate API token authentication for Stibo Producer (scenario outline)

#### [src/features/validationTest.feature](src/features/validationTest.feature)
- Test validation with invalid XML data

### Generated outputs
- [test-reports](test-reports): HTML/JSON reports, Excel reports, and logs generated after runs.

## Implementation notes
- Validation is performed before sending XML/JSON in Stibo flows.
- Request preprocessing (fixture read, XML/JSON conversion, validation) is cached
	by request body content. This improves repeated step performance without ever
	reusing HTTP responses.
- To isolate caches by feature file, set CLEAR_CACHE_PER_FEATURE to any non-empty
	value. When enabled, caches are cleared when moving between feature files.
- Reports are written to test-reports and then surfaced by the dashboard.
- Excel reports are generated post-run from cucumber-report.json.
- OAuth client-credentials tokens are supported for Authorization headers when no static token is set.
- Optional AES-256-GCM encryption/decryption can be enabled via headers or environment variables for demo validations.
 
### Dashboard authentication note
To provide an Authorization token to tests, use one of the supported approaches:

- Set `BEARER_TOKEN` or `TOKEN` in your environment (`.env`) for static tokens.
- Use OAuth client credentials by setting `OAUTH_TOKEN_URL`, `OAUTH_CLIENT_ID`, and `OAUTH_CLIENT_SECRET` (the framework will fetch and cache access tokens).
- Extract tokens at runtime from the browser session using `src/utils/bearerTokenHelper.ts` when tests target web flows that store tokens in `sessionStorage`.

Example `.env` entries:

```
BEARER_TOKEN=eyJhbGciOiJ...   # optional - static token
OAUTH_TOKEN_URL=https://auth.example.com/oauth/token
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
```

If you need the convenience of providing a token from the dashboard UI for local demos, consider adding it to your `.env` temporarily. For production or shared environments prefer OAuth or `bearerTokenHelper`.