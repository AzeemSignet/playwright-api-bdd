# Feature: dom Employee Consumer API validation
# Purpose: Validate dom Employee Consumer requests, token handling, and error conditions.
@domEmployeeConsumer
Feature: dom Employee Consumercer API validation

  # @smoke @positive @regression @domEmployeeConsumer
  # TC_001 Confirms a valid consumer request returns a 2xx response.
  # Uses document_Key captured from Workday Employee Producer (if available)
  Scenario: TC_001 Validate successful dom Employee Consumer API response
  Given API authentication header is "" present
      | Document-Key       | 336c118d-ad75-48e3-912f-1492fa328c0b  |
      | Consumer-Key       | digital_employee_consumer             |
      | Native-Business-Id | 44604684492                           |
      | Content-Type       | application/json                      |
      | Accept             | application/json                      |    
    When I print request body converted to json from "DOM_CONSUMER_VALID_REQ_BODY"
    When I send a "POST" request to "DIGITAL_EMPLOYEE_CONSUMER" with request body from "DOM_CONSUMER_VALID_REQ_BODY"
    Then I print the response
    Then response status should be "2xx"



