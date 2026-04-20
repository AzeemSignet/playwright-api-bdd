# Feature: Stibo Producer API validation
# Purpose: Validate CVP producer request flow and expected success response.
Feature: Stibo Producer API validation

  # Ensures a valid CVP producer request returns a 2xx response.
  @stibocvp
  Scenario: Validate successful Stibo Producer API response
    Given API authentication header is "" present
      | Content-Type       | application/xml  |
      | Native-Business-Id | 9999             |
      | interface-key      | mdm-producer     |
    When I send a "POST" request to "STIBO_MDM_V1" with request body from "PRODUCER_CVP_REQ_BODY_XML"
    And I print the response
    Then response status should be "2xx"