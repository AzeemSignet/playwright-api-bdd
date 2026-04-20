# Feature: Validation Testing
# Purpose: Run invalid-data validation to verify error handling.
Feature: Validation Testing
  Testing the request body validation system with invalid data

  # @validation-test @negative
  # TC_006 Confirms invalid XML payloads are handled and reported correctly.
  Scenario: Test validation with invalid XML data
    Given API authentication header is "" present
      | Native-Business-Id | 9999         |
      | interface-key      | mdm-producer |
    When I send a "POST" request to "STIBO_CUSTOM_EXPORT" with request body from "PRODUCER_REQT_BODY_INVALID_XML"
    And I print the response
    Then response status should be "4xx"