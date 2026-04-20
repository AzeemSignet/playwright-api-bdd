# Feature: Producer Request Body Validation
# Purpose: Validate producer request payloads, data types, ranges, and batch behavior.

@producer-req-body-validation
Feature: Producer Request Body Validation
  Comprehensive validation testing for producer request body with multiple test scenarios
  Testing data types, field constraints, and business rules validation

# Validates a set of producer payloads that should pass all rules.
  Scenario:- 1. Test producer request body with valid data
    Given API authentication header is "" present
      | Native-Business-Id | 9999         |
      | interface-key      | mdm-producer |
    When I load producer test scenarios from "PRODUCER_REQ_BODY_TEST_SCENARIOS_CSV"
    And I validate producer scenarios with data type rules
    Then validation should pass for valid scenarios
    And I generate producer validation test report
    And I generate interactive validation report with scenario lists

# Exercises negative cases and captures field-level failures.
  Scenario:- 2. Test producer request body with invalid data variations
    Given API authentication header is "" present
      | Native-Business-Id | 9999         |
      | interface-key      | mdm-producer |
    When I load producer test scenarios from "PRODUCER_REQ_BODY_TEST_SCENARIOS_CSV"
    And I validate producer data against field constraints
    Then I capture field validation failures with details
    And I generate detailed field error report

# Verifies specific attributes conform to expected data types.
  Scenario: Test producer request body data type validation
    Given API authentication header is "" present
      | Native-Business-Id | 9999         |
      | interface-key      | mdm-producer |
    When I load producer test scenarios from "PRODUCER_REQ_BODY_TEST_SCENARIOS_CSV"
    And I validate data types for producer scenarios:
      | attribute_id                | expected_type | description                     |
      | entity_id                   | number        | Entity identifier (numeric)     |
      | user_type                   | string        | User type classification        |
      | parent_id                   | string        | Parent entity reference         |
      | entity_name                 | string        | Entity name/description         |
      | TEMP_P_LONGITUDE            | number        | Longitude coordinate (-180,180) |
      | TEMP_P_LATITUDE             | number        | Latitude coordinate (-90,90)    |
      | TEMP_P_ZIPCODE              | string        | ZIP code format (5 or 9 digit)  |
      | STORE_NAME                  | string        | Store name (max 100 chars)      |
      | TRANS_FEDEX_GROUND          | number        | Fedex ground count              |
      | STORE_SYSTEM_FLAG_7         | boolean       | System flag boolean             |
      | TOTAL_DSC_SF                | number        | Total DSC square feet           |
      | BOPIS_TUE_END_TIME          | time          | BOPIS Tuesday end time          |
      | LAST_UPDATE_DATE            | datetime      | Last update timestamp           |
    Then all producer data types should be valid
    And I print the validation type report

# Validates numeric ranges and string constraints for key fields.
  Scenario: Test producer request body range validation
    Given API authentication header is "" present
      | Native-Business-Id | 9999         |
      | interface-key      | mdm-producer |
    When I load producer test scenarios from "PRODUCER_REQ_BODY_TEST_SCENARIOS_CSV"
    And I validate producer data range constraints:
      | field_name          | min_value | max_value | constraint_type |
      | TEMP_P_LONGITUDE    | -180      | 180       | numeric_range   |
      | TEMP_P_LATITUDE     | -90       | 90        | numeric_range   |
      | STORE_NAME          | 1         | 100       | string_length   |
      | TEMP_P_ZIPCODE      | 5         | 10        | string_pattern  |
    Then range validation results should be captured
    And I generate range validation error report

# Sends a small batch of producer scenarios to the API and summarizes results.
  Scenario: Batch test producer request body against API endpoint
    Given API authentication header is "" present
      | Native-Business-Id | 9999         |
      | interface-key      | mdm-producer |
    When I load producer test scenarios from "PRODUCER_REQ_BODY_TEST_SCENARIOS_CSV"
    And I send top 5 producer scenarios as POST requests to "/custom-export/stibo/mdm/v1"
    Then I should capture response details for each batch request
    And I generate batch API validation report
    And I print the batch validation results summary
