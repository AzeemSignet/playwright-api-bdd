# Feature: Profound Exporter Interface
# Purpose: Validate Health Check of Profound Health Check Interface
@profoundExporterHealthcheck @profoundaeogeohealthcheck
Feature: Profound Prompt Exporter API Validation

  @smoke @positive @regression
  # TC_001 Confirms a valid exporter health check request returns a 2xx response.
  Scenario: TC_001 Validate successful Profound Exporter API response
    Given API authentication header is "" present  
    | Content-Type       | application/json                      |                         
    When I print request body converted to json from "PROFOUND_AEO_GEO_HEALTHCHECK_REQ_BODY"
    And I send a "POST" request to "PROFOUND_PROMPT_EXPORTER" with request body from "PROFOUND_AEO_GEO_HEALTHCHECK_REQ_BODY"
    And I print the response
    Then response status should be "2xx"
    And response should contain key "status" with value "ok"
    And response should contain key "resources[1].name" with value "Configuration"

  @smoke @positive @regression @exphappypath
  # TC_002 Confirms a valid exporter response with valid request.
  Scenario: TC_002 Validate successful Profound Exporter API response
    Given API authentication header is "" present  
    | Content-Type       | application/json                      |                         
    When I print request body converted to json from "PROFOUND_AEO_GEO_EXPORTER_REQ_BODY"
    And I send a "POST" request to "PROFOUND_PROMPT_EXPORTER_API" with request body from "PROFOUND_AEO_GEO_EXPORTER_REQ_BODY"
    And I print the response
    Then response status should be "2xx"
    And response should have key "document_key"
    And response should contain key "wasPosted" with value "true"

  @smoke @negative @regression @exception
  # TC_003 Confirms a invalid exporter response with VPN disconnected.
  Scenario: TC_003 Confirms a invalid exporter response with VPN disconnected.
    Given API authentication header is "" present  
    | Content-Type       | application/json                      |                         
    When I print request body converted to json from "PROFOUND_AEO_GEO_EXPORTER_REQ_BODY"
    And I send a "POST" request to "PROFOUND_PROMPT_EXPORTER_API" with request body from "PROFOUND_AEO_GEO_EXPORTER_REQ_BODY"
    And I print the response
    Then response status should be "4xx"

  @smoke @positive @regression @futuredate
  # TC_004 Confirms exporter response with future trigger_time (today+1).
  Scenario: TC_004 Validate successful Profound Exporter API response with future date
    Given API authentication header is "" present  
    | Content-Type       | application/json                      |                         
    When I print request body converted to json from "PROFOUND_AEO_GEO_EXPORTER_FUT_REQ_BODY"
    And I send a "POST" request to "PROFOUND_PROMPT_EXPORTER_API" with request body from "PROFOUND_AEO_GEO_EXPORTER_FUT_REQ_BODY"
    And I print the response
    Then response status should be "4xx"

  @smoke @negative @regression @pastdate
  # TC_005 Confirms a valid exporter response with valid request - past, no data.
  Scenario: TC_002 Validate successful Profound Exporter API response past date, no data
    Given API authentication header is "" present  
    | Content-Type       | application/json                      |                         
    When I print request body converted to json from "PROFOUND_AEO_GEO_EXPORTER_PAST_NODATA_REQ_BODY"
    And I send a "POST" request to "PROFOUND_PROMPT_EXPORTER_API" with request body from "PROFOUND_AEO_GEO_EXPORTER_PAST_NODATA_REQ_BODY"
    And I print the response
    Then response status should be "2xx"
    And response should have key "document_key"
    And response should contain key "wasPosted" with value "false"
    And response should contain key "message" with value "No data found in Profound - exiting early"
