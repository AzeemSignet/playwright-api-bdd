# Feature: Common API Test Cases
# Purpose: Reusable and cross-cutting test scenarios applicable to any API endpoint.
#          These scenarios cover authentication, response validation, token handling,
#          error conditions, and payload integrity checks shared across all producers/consumers.
@common
Feature: Common API Test Cases
  Shared validation scenarios that apply across multiple API endpoints and producers.
  These tests establish baseline behaviour expectations for authentication, status codes,
  request/response structure, and error handling.

  # ---------------------------------------------------------------------------
  # POSITIVE / SMOKE TESTS
  # ---------------------------------------------------------------------------

  @smoke @positive @regression @common
  # TC_C001 Confirms that a well-formed POST request with valid headers returns a 2xx response.
  Scenario: TC_C001 Validate successful API response with valid authentication headers
    Given API authentication header is "" present
      | Content-Type | application/json |
    When I send a "POST" request to "DEFAULT_ENDPOINT" with request body from "VALID_REQ_BODY"
    And I print the response
    Then response status should be "2xx"

  @smoke @positive @regression @common
  # TC_C002 Confirms that a well-formed GET request with a valid Bearer token returns a 2xx response.
  Scenario: TC_C002 Validate successful GET request with Bearer token
    Given API authentication header is "" present
      | Authorization | Bearer test-token-123 |
      | Content-Type  | application/json      |
    When I send a "GET" request to "DEFAULT_ENDPOINT"
    And I print the response
    Then response status should be "2xx"

  @smoke @positive @regression @common
  # TC_C003 Prints the serialised request body before sending to aid debugging/logging.
  Scenario: TC_C003 Validate request body is printed correctly before sending
    Given API authentication header is "" present
      | Content-Type | application/json |
    When I print request body converted to json from "VALID_REQ_BODY"
    When I send a "POST" request to "DEFAULT_ENDPOINT" with request body from "VALID_REQ_BODY"
    And I print the response
    Then response status should be "2xx"

  # ---------------------------------------------------------------------------
  # TOKEN / AUTHENTICATION OUTLINE TESTS
  # ---------------------------------------------------------------------------

  @regression @common @auth
  # TC_C004 Exercises multiple token types to confirm correct accept/reject behaviour.
  #         Valid Bearer tokens should yield 2xx; missing or malformed tokens should yield 4xx.
  Scenario Outline: TC_C004 Validate API response for different Authorization token values
    Given API authentication header is "" present
      | Authorization | <token_value> |
    When I send a "POST" request to "DEFAULT_ENDPOINT" with request body from "VALID_REQ_BODY"
    And I print the response
    Then response status should be "<expected_status>"

    Examples:
      | token_value           | expected_status |
      | Bearer test-token-123 | 2xx             |
      |                       | 4xx             |
      | $%^Invalid##Token     | 4xx             |
      | Bearer expired-token  | 4xx             |

  # ---------------------------------------------------------------------------
  # NEGATIVE / ERROR HANDLING TESTS
  # ---------------------------------------------------------------------------

  @negative @regression @common
  # TC_C005 Sends a request with no Authorization header; expects the API to reject with 4xx.
  Scenario: TC_C005 Validate API rejects request with missing Authorization header
    Given API authentication header is "" present
      | Content-Type | application/json |
    When I send a "POST" request to "DEFAULT_ENDPOINT" with request body from "VALID_REQ_BODY"
    And I print the response
    Then response status should be "4xx"

  @negative @regression @common
  # TC_C006 Sends a request containing an invalid/malformed JSON payload; expects 4xx rejection.
  Scenario: TC_C006 Validate API rejects request with invalid request body
    Given API authentication header is "" present
      | Content-Type | application/json |
    When I send a "POST" request to "DEFAULT_ENDPOINT" with request body from "INVALID_REQ_BODY"
    And I print the response
    Then response status should be "4xx"

  @negative @regression @common
  # TC_C007 Sends an empty request body; expects the API to return a 4xx bad-request error.
  Scenario: TC_C007 Validate API rejects request with empty request body
    Given API authentication header is "" present
      | Content-Type | application/json |
    When I send a "POST" request to "DEFAULT_ENDPOINT" with request body from "EMPTY_REQ_BODY"
    And I print the response
    Then response status should be "4xx"

  # ---------------------------------------------------------------------------
  # CONTENT-TYPE / HEADER VALIDATION TESTS
  # ---------------------------------------------------------------------------

  @regression @common @headers
  # TC_C008 Verifies that sending an unsupported Content-Type (e.g., text/plain) yields 4xx.
  Scenario: TC_C008 Validate API rejects unsupported Content-Type header
    Given API authentication header is "" present
      | Content-Type  | text/plain            |
      | Authorization | Bearer test-token-123 |
    When I send a "POST" request to "DEFAULT_ENDPOINT" with request body from "VALID_REQ_BODY"
    And I print the response
    Then response status should be "4xx"

  @regression @common @headers
  # TC_C009 Confirms the API accepts multiple common authentication mechanisms.
  Scenario Outline: TC_C009 Validate multiple authentication header mechanisms
    Given API authentication header is "" present
      | <header_name> | <header_value> |
    When I send a "POST" request to "DEFAULT_ENDPOINT" with request body from "VALID_REQ_BODY"
    And I print the response
    Then response status should be "2xx"

    Examples:
      | mechanism | header_name   | header_value          |
      | Bearer    | Authorization | Bearer valid-token    |
      | API Key   | X-API-Key     | api-key-abc-123       |
      | SSO       | X-SSO-Token   | sso-token-xyz-789     |

  # ---------------------------------------------------------------------------
  # RESPONSE STRUCTURE VALIDATION
  # ---------------------------------------------------------------------------

  @regression @common @response
  # TC_C010 Verifies that the response body is not empty and is valid JSON.
  Scenario: TC_C010 Validate response body is present and non-empty
    Given API authentication header is "" present
      | Content-Type | application/json |
    When I send a "POST" request to "DEFAULT_ENDPOINT" with request body from "VALID_REQ_BODY"
    And I print the response
    Then response status should be "2xx"

  # ---------------------------------------------------------------------------
  # BATCH / BULK REQUEST TESTS
  # ---------------------------------------------------------------------------

  @regression @common @batch
  # TC_C011 Sends a batch of requests and verifies each returns a successful response.
  #         Used to confirm the API can handle multiple consecutive calls without degradation.
  Scenario: TC_C011 Validate batch API requests return successful responses
    Given API authentication header is "" present
      | Content-Type | application/json |
    When I load producer test scenarios from "PRODUCER_REQ_BODY_TEST_SCENARIOS_CSV"
    And I send top 5 producer scenarios as POST requests to "DEFAULT_ENDPOINT"
    Then I should capture response details for each batch request
    And I generate batch API validation report
    And I print the batch validation results summary
