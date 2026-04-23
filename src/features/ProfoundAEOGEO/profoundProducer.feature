# Feature: Profound Producer Interface
# Purpose: Validate Health Check of Profound Health Check Interface
@profoundProducerHealthcheck @profoundaeogeohealthcheck
Feature: Profound Prompt Producer API Validation

  @smoke @positive @regression
  # TC_001 Confirms a valid Producer health check request returns a 2xx response.
  Scenario: TC_001 Validate successful Profound Producer API response
    Given API authentication header is "" present  
    | Content-Type       | application/json                      |                         
    When I print request body converted to json from "PROFOUND_AEO_GEO_HEALTHCHECK_REQ_BODY"
    When I send a "POST" request to "PROFOUND_PROMPT_PRODUCER" with request body from "PROFOUND_AEO_GEO_HEALTHCHECK_REQ_BODY"
    And I print the response
    Then response status should be "2xx"
    Then response should contain key "status" with value "ok"
    Then response should contain key "resources[1].name" with value "Configuration"

  @smoke @positive @regression @exphappypath2
  # TC_002 Confirms a valid producer response with valid request.
  Scenario: TC_002 Validate successful Profound Producer API response
    Given API authentication header is "" present  
    | Content-Type       | application/json                                         |                         
    | Producer-Key       | esi_profound_to_sams_for_prompt_dfd                      |                         
    | Chunk-Id           | 1773071207871                                            |                         
    | Batch-Key          | e9afc009-68e5-49dd-ab16-85618c56e3ed                     |                         
    When I print request body converted to json from "PROFOUND_AEO_GEO_PRODUCER_REQ_BODY"
    And I send a "POST" request to "PROFOUND_PROMPT_PRODUCER_API" with request body from "PROFOUND_AEO_GEO_PRODUCER_REQ_BODY"
    And I print the response
    Then response status should be "2xx"
    And response should have key "document_key"
    And response should contain key "was_posted" with value "true"

  @smoke @negative @regression @exception
  # TC_003 Confirms a invalid exporter response with VPN disconnected.
  Scenario: TC_003 Confirms a invalid exporter response with VPN disconnected.
    Given API authentication header is "" present  
    | Content-Type       | application/json                      |
    | Producer-Key       | esi_profound_to_sams_for_prompt_dfd                      |                         
    | Chunk-Id           | 1773071207871                                            |                         
    | Batch-Key          | e9afc009-68e5-49dd-ab16-85618c56e3ed                     |                        
    When I print request body converted to json from "PROFOUND_AEO_GEO_PRODUCER_REQ_BODY"
    And I send a "POST" request to "PROFOUND_PROMPT_PRODUCER_API" with request body from "PROFOUND_AEO_GEO_PRODUCER_REQ_BODY"
    And I print the response
    Then response status should be "4xx"
