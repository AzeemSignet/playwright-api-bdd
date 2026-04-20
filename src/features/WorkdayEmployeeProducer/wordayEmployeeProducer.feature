# Feature: Workday Employee Producer API validation
# Purpose: Validate Workday Employee producer requests, token handling, and error conditions.
@workdayEmployeeProducer
Feature: Workday Employee Producer API validation

  @smoke @positive @regression @workdayEmployeeProducer
  # TC_001 Confirms a valid producer request returns a 2xx response.
  Scenario: TC_001 Validate successful Workday Employee Producer API response
    Given API authentication header is "" present  
    | Content-Type       | application/json                      |                         
    When I print request body converted to json from "WORKDAY_PRODUCER_VALID_REQ_BODY"
    When I send a "POST" request to "WORKDAY_EMPLOYEE_PRODUCER" with request body from "WORKDAY_PRODUCER_VALID_REQ_BODY"
    And I print the response
    Then response status should be "2xx"