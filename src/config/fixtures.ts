/**
 * Centralized fixture file paths used in feature files and step definitions.
 */
export const FIXTURES: Record<string, string> = {
  PRODUCER_REQ_BODY_XML: 'fixtures/producer-request-body.xml',
  PRODUCER_REQ_BODY_EXCEEDS_256_XML: 'fixtures/producer-request-body exceeds 256.xml',
  PRODUCER_REQT_BODY_INVALID_XML: 'fixtures/producer-request-body-invalid.xml',
  PRODUCER_CVP_REQ_BODY_XML: 'fixtures/producer-cvp-request-body.xml',
  PRODUCER_REQ_BODY_TEST_SCENARIOS_CSV: 'fixtures/producer_request_body_test_scenarios.csv',
  ATTRIBUTES_CSV: 'fixtures/attributes.csv',
  WORKDAY_PRODUCER_VALID_REQ_BODY:'fixtures/workdayProducerValidReqBody.json',  
  DOM_CONSUMER_VALID_REQ_BODY:'fixtures/domConsumerValidReqBody.json',
  PROFOUND_AEO_GEO_HEALTHCHECK_REQ_BODY:'fixtures/empty_request.json',  
  PROFOUND_AEO_GEO_EXPORTER_REQ_BODY:'fixtures/profoundexporter.json', 
  PROFOUND_AEO_GEO_EXPORTER_FUT_REQ_BODY:'fixtures/profoundexporter_fut.json', 
  PROFOUND_AEO_GEO_EXPORTER_PAST_NODATA_REQ_BODY:'fixtures/profoundexporter_past_nodata.json', 
  PROFOUND_AEO_GEO_PRODUCER_REQ_BODY:'fixtures/profoundproducer.json', 
  PROFOUND_AEO_GEO_CONSUMER_REQ_BODY:'fixtures/profoundconsumer.json',
};
