# Feature: Profound Consumer Interface
# Purpose: Validate Health Check of Profound Health Check Interface
@profoundConsumerHealthcheck @profoundaeogeohealthcheck
Feature: Profound Prompt Consumer API Validation

  @smoke @positive @regression
  # TC_001 Confirms a valid Consumer health check request returns a 2xx response.
  Scenario: TC_001 Validate successful Profound Consumer API response
    Given API authentication header is "" present  
    | Content-Type       | application/json                      |                         
    When I print request body converted to json from "PROFOUND_AEO_GEO_HEALTHCHECK_REQ_BODY"
    And I send a "POST" request to "PROFOUND_PROMPT_CONSUMER" with request body from "PROFOUND_AEO_GEO_HEALTHCHECK_REQ_BODY"
    And I print the response
    Then response status should be "2xx"
    And response should contain key "status" with value "ok"
    And response should contain key "resources[1].name" with value "Configuration"

  @smoke @positive @regression @exphappypath3
  # TC_002 Confirms a valid consumer response with valid request.
  Scenario: TC_002 Validate successful Profound Consumer API response
    Given API authentication header is "" present  
    | Content-Type        | application/json                                         |
    | Document-Key        | 2e07e3ca-e46c-40b0-842d-f96a67a2a9fc                     |                
    | Producer-Key        | profound_prompt_producer                                 |                         
    | Native-Business-Id  | 9ceee0a7-cce7-4ea9-98ee-4406fdc4f9a1                     |                         
    | Consumer-Key        | digital_prompt_consumer                                  |
    | Interface-Key       | profound_prompt_producer                                 |                        
    When I print request body converted to json from "PROFOUND_AEO_GEO_CONSUMER_REQ_BODY"
    And I send a "POST" request to "PROFOUND_PROMPT_CONSUMER_API" with request body from "PROFOUND_AEO_GEO_CONSUMER_REQ_BODY"
    And I print the response
    Then response status should be "2xx"
    And response should have key "document_key"
    And response should contain key "wasPosted" with value "true"

  @smoke @negative @regression @exception33
  # TC_003 Confirms a invalid exporter response with VPN disconnected.
  Scenario: TC_003 Confirms a invalid exporter response with VPN disconnected.
    Given API authentication header is "" present  
    | Content-Type       | application/json                                          |
    | Document-Key        | 2e07e3ca-e46c-40b0-842d-f96a67a2a9fc                     |
    | Producer-Key        | profound_prompt_producer                                 |                         
    | Native-Business-Id  | 9ceee0a7-cce7-4ea9-98ee-4406fdc4f9a1                     |                         
    | Consumer-Key        | digital_prompt_consumer                                  |
    | Interface-Key       | profound_prompt_producer                                 |                    
    When I print request body converted to json from "PROFOUND_AEO_GEO_CONSUMER_REQ_BODY"
    And I send a "POST" request to "PROFOUND_PROMPT_CONSUMER_API" with request body from "PROFOUND_AEO_GEO_CONSUMER_REQ_BODY"
    And I print the response
    Then response status should be "4xx"