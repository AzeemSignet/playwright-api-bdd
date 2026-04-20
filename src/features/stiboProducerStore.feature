# Feature: Stibo Producer API validation
# Purpose: Validate store producer requests, token handling, and error conditions.
# @stiboproducerstore @beforehook
Feature: Stibo Producer API validation

  # @smoke @inputRequestBodyFormats
  # Verifies the request body conversion to JSON for inspection.
  Scenario: Print request body converted to JSON
    When I print request body converted to json from "PRODUCER_REQ_BODY_XML"

  # @smoke @positive @regression @AAA
  # TC_001 & TC_003 Confirms a valid producer request returns a 2xx response.
  Scenario: TC_001 & TC_003 Validate successful Stibo Producer API response
    Given API authentication header is "" present
      | Content-Type       | application/xml  |
      | Native-Business-Id | 9999             |
      | interface-key      | mdm-producer     |
    When I send a "POST" request to "STIBO_MDM_V1" with request body from "PRODUCER_REQ_BODY_XML"
    And I print the response
    Then response status should be "2xx"

  # @smoke @negative
  # TC_004 Ensures missing/invalid auth headers yield a 4xx response.
  Scenario: TC_004 Validate unsuccessful Stibo Producer API response
    Given API authentication header is "not" present
      | Content-Type       | application/xml  |
      | Native-Business-Id |                  |
      | interface-key      | mdm-producer     |
    When I send a "POST" request to "STIBO_MDM_V1" with request body from "PRODUCER_REQ_BODY_XML"
    And I print the response
    Then response status should be "4xx"

  # @smoke @negative
  # TC_005 Ensures missing/invalid auth headers yield a 4xx response.
  Scenario: TC_005 Validate unsuccessful Stibo Producer API response
    Given API authentication header is "not" present
      | Content-Type       | application/xml  |
      | Native-Business-Id | 9999             |
    When I send a "POST" request to "STIBO_MDM_V1" with request body from "PRODUCER_REQ_BODY_XML"
    And I print the response
    Then response status should be "4xx"

  # @smoke @negative
  # TC_011 Validates error handling when the endpoint is empty or malformed.
  Scenario: TC_011 Validate the stibo producer URL incorrect or Malformed
    Given API authentication header is "" present
      | Content-Type       | application/xml  |
      | Native-Business-Id | 9999             |
      | interface-key      | mdm-producer     |
    When I send a "POST" request to "" with request body from "PRODUCER_REQ_BODY_XML"
    And I print the response
    Then response status should be "4xx"

  # @smoke @negative
  # TC_007 Validates payload size enforcement (over 256KB rejected).
  Scenario: TC_007 Validate the stibo producer request body against pre configurable size 256KB
    Given API authentication header is "" present
      | Content-Type       | application/xml  |
      | Native-Business-Id | 9999             |
      | interface-key      | mdm-producer     |
    When I send a "POST" request to "STIBO_MDM_V1" with request body from "PRODUCER_REQ_BODY_EXCEEDS_256_XML"
    And I print the response
    Then response status should be "4xx"

  # @smoke @negative
  # TC_009 Ensures GET is rejected for the producer endpoint.
  Scenario: TC_009 Validate Stibo Producer API response for Get Method
    Given API authentication header is "" present
      | Content-Type       | application/xml  |
      | Native-Business-Id | 9999             |
      | interface-key      | mdm-producer     |
    When I send a "GET" request to "STIBO_MDM_V1"
    And I print the response
    Then response status should be "4xx"

  # @token
  # TC_008 Evaluates multiple token formats and expected authorization outcomes.
  Scenario: TC_008 Validate API token authentication for Stibo Producer
    Given API authentication header is "" present
      | Content-Type       | application/xml  |
      | Native-Business-Id | 9999             |
      | interface-key      | mdm-producer     |
      | Authorization      | <token_value>    |
    When I send a "POST" request to "STIBO_MDM_V1" with request body from "PRODUCER_REQ_BODY_XML"
    And I print the response
    Then response status should be "<expected_status>"

    Examples:
      | token_value                    | expected_status |
      | Bearer valid_token_here        | 2xx             |
      | Bearer invalid_token           | 4xx             |
      | Bearer expired_token           | 4xx             |
      |                                | 4xx             |
      | InvalidFormat                  | 4xx             |
      | Basic invalid_basic_token      | 4xx             |