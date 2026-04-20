# Producer Request Body Validation Testing Guide

## Overview

This document describes the comprehensive validation testing framework for producer request body data using the `producerRequestBodyValidation.feature` file and associated step definitions.

## Feature File Structure

The validation testing is organized into multiple test scenarios in [src/features/producerRequestBodyValidation.feature](src/features/producerRequestBodyValidation.feature):

### 1. **Test producer request body with valid data** (@producer-req-body-validation @smoke)
- **Purpose**: Validates producer scenarios with data type rules
- **Data Source**: `fixtures/producer_request_body_test_scenarios.csv`
- **Output**: JSON report showing validation results
- **Success Rate**: 93.78% of scenarios pass basic data type validation

**Test Steps**:
```gherkin
Given API authentication header is "" present
When I load producer test scenarios from "fixtures/producer_request_body_test_scenarios.csv"
And I validate producer scenarios with data type rules
Then validation should pass for valid scenarios
And I generate producer validation test report
```

**Report Location**: `test-reports/producer-validation-summary-<timestamp>.json`

---

### 2. **Test producer request body with invalid data variations** (@producer-validation-invalid @validation-test)
- **Purpose**: Captures and details field-level validation failures
- **Data Source**: `fixtures/producer_request_body_test_scenarios.csv`
- **Output**: Detailed error report with field-specific information

**Test Steps**:
```gherkin
Given API authentication header is "" present
When I load producer test scenarios from "fixtures/producer_request_body_test_scenarios.csv"
And I validate producer data against field constraints
Then I capture field validation failures with details
And I generate detailed field error report
```

**Report Location**: `test-reports/producer-validation-<timestamp>.json`

**Sample Error Report**:
```json
{
  "timestamp": "2026-01-28T10:32:35.334Z",
  "testType": "field_validation",
  "totalScenarios": 3234,
  "totalErrors": 201,
  "errorsByField": {
    "entity_id": [
      {
        "field": "entity_id",
        "value": "\"",
        "message": "entity_id value \"\" does not match required pattern",
        "rule": "constraint"
      }
    ]
  }
}
```

---

### 3. **Test producer request body data type validation** (@producer-validation-types @smoke)
- **Purpose**: Comprehensive data type validation with rule definitions
- **Test Fields**:
  - `entity_id` → number
  - `user_type` → string
  - `parent_id` → string
  - `entity_name` → string
  - `TEMP_P_LONGITUDE` → number (-180 to 180)
  - `TEMP_P_LATITUDE` → number (-90 to 90)
  - `TEMP_P_ZIPCODE` → string
  - `STORE_NAME` → string (max 100 chars)
  - `TRANS_FEDEX_GROUND` → number
  - `STORE_SYSTEM_FLAG_7` → boolean
  - `TOTAL_DSC_SF` → number
  - `BOPIS_TUE_END_TIME` → time
  - `LAST_UPDATE_DATE` → datetime

**Report Location**: `test-reports/data-type-validation-<timestamp>.json`

**Sample Report**:
```json
{
  "timestamp": "2026-01-28T10:32:24.381Z",
  "testType": "data_type_validation",
  "totalChecks": 7,
  "passedChecks": 6,
  "failedChecks": 1,
  "successRate": "85.71%"
}
```

---

### 4. **Test producer request body range validation** (@producer-validation-ranges @validation)
- **Purpose**: Validates numeric and string range constraints
- **Constraint Types**:
  - `numeric_range`: Validates min/max numeric bounds
  - `string_length`: Validates string length constraints
  - `string_pattern`: Validates pattern-based constraints

**Report Location**: `test-reports/range-validation-<timestamp>.json`

---

### 5. **Batch test producer request body against API endpoint** (@producer-validation-batch @smoke)
- **Purpose**: Tests top N scenarios through API endpoint
- **Default**: Tests top 5 scenarios
- **Output**: Batch API response details and success rates

**Report Location**: `test-reports/batch-api-validation-<timestamp>.json`

**Sample Report**:
```json
{
  "timestamp": "2026-01-28T10:32:48.489Z",
  "testType": "batch_api_validation",
  "totalRequests": 5,
  "successfulRequests": 5,
  "failedRequests": 0,
  "successRate": "100.00%",
  "requests": [
    {
      "scenarioId": 0,
      "status": 200,
      "response": { "success": true, "message": "Validation passed" }
    }
  ]
}
```

---

## Running the Tests

### Run All Producer Validation Tests
```bash
npm run test -- --tags "@producer-req-body-validation"
```

### Run Specific Test Scenario

#### Valid Data Validation
```bash
npm run test -- --tags "@producer-req-body-validation" --tags "@smoke"
```

#### Invalid Data with Field Errors
```bash
npm run test -- --tags "@producer-validation-invalid"
```

#### Data Type Validation
```bash
npm run test -- --tags "@producer-validation-types"
```

#### Range Validation
```bash
npm run test -- --tags "@producer-validation-ranges"
```

#### Batch API Validation
```bash
npm run test -- --tags "@producer-validation-batch"
```

---

## Field Error Details in Responses

When validation fails, the error response now includes field-level details:

### Response Format
```json
{
  "error": "Request Validation Failed",
  "message": "Request validation failed with 2 error(s). Check logs for details.",
  "code": 413,
  "details": [
    {
      "field": "STEP-ProductInformation.Entities.Entity.ID",
      "message": "Entity ID must be a numeric string",
      "value": "ABC123",
      "rule": "pattern"
    },
    {
      "field": "STEP-ProductInformation.Entities.Entity.Name",
      "message": "Entity Name must be 1-256 characters",
      "value": "",
      "rule": "required"
    }
  ]
}
```

### Field Error Properties
- **field**: The path to the field that failed validation
- **message**: Human-readable error description
- **value**: The actual value that failed validation
- **rule**: The validation rule that was violated

---

## Test Data Source

**File**: `src/features/fixtures/producer_request_body_test_scenarios.csv`

**Total Records**: 3,234 test scenarios

**Key Columns**:
- `entity_id`: Store/entity identifier
- `user_type`: Classification type (STORE, etc.)
- `parent_id`: Parent entity reference
- `entity_name`: Entity name
- `attribute_id`: Attribute identifier
- `value`: Attribute value
- `inferred_type`: Expected data type
- Additional metadata for validation rules

---

## Report Generation

All tests automatically generate detailed JSON reports in `test-reports/` directory:

1. **producer-validation-summary-<timestamp>.json** - Overall validation summary
2. **producer-validation-<timestamp>.json** - Field-level error details
3. **data-type-validation-<timestamp>.json** - Data type validation metrics
4. **range-validation-<timestamp>.json** - Range constraint violations
5. **batch-api-validation-<timestamp>.json** - Batch API request results

---

## Integration with Other Features

The producer validation framework integrates with existing validation components:

### Files Modified
- **src/utils/httpHelper.ts**: Enhanced error response with field details
- **src/step-definitions/stiboapisteps.ts**: Improved error display and field-level logging

### Related Features
- [validationTest.feature](src/features/validationTest.feature) - Basic validation testing
- [apiFieldValidation.feature](src/features/apiFieldValidation.feature) - Field-level validation
- [stiboProducerStore.feature](src/features/stiboProducerStore.feature) - Producer data handling

---

## Validation Rules Applied

### Data Type Validation
- **Number**: Validates numeric values and ranges
- **String**: Validates string format and length
- **Date/DateTime**: Validates ISO 8601 date formats
- **Time**: Validates HH:MM AM/PM format
- **Boolean**: Validates Y/N or true/false values

### Field Constraints
- **Longitude**: Range -180 to 180
- **Latitude**: Range -90 to 90
- **Store Name**: Max 100 characters
- **ZIP Code**: Format ##### or #####-####
- **Entity ID**: Numeric only

---

## Troubleshooting

### Test Failures
- Check `test-reports/` directory for detailed error logs
- Review console output for validation rule violations
- Examine CSV file for data format issues

### Missing Reports
- Verify `test-reports/` directory exists
- Check file system permissions
- Ensure tests completed successfully

### Data Issues
- Validate CSV file encoding (UTF-8)
- Check for special characters in values
- Verify data types match expected formats

---

## Best Practices

1. **Run Tests Regularly**: Include in CI/CD pipeline
2. **Review Reports**: Analyze JSON reports for pattern identification
3. **Update Constraints**: Adjust validation rules based on business requirements
4. **Archive Results**: Keep reports for audit trail
5. **Monitor Success Rates**: Track data quality trends

---

## Future Enhancements

- [ ] Real API endpoint integration (currently simulated)
- [ ] Advanced data quality metrics
- [ ] Custom validation rule definitions
- [ ] Automated report generation and archival
- [ ] Dashboard for validation trend analysis
