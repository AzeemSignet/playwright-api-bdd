/**
 * Centralized API endpoint paths used in feature files and step definitions.
 */
export const ENDPOINTS: Record<string, string> = {
  STIBO_CUSTOM_EXPORT: '/custom-export/stibo/mdm/v1',
  STIBO_MDM_V1: '/stibo/mdm/v1',
  WORKDAY_EMPLOYEE_PRODUCER:'/custom-export/workday/employee/v1',
  DIGITAL_EMPLOYEE_CONSUMER:'/custom-import/digital/employee/v1',
  PROFOUND_PROMPT_EXPORTER:'/custom-export/profound/prompt-exporter/v1/healthCheck',
  PROFOUND_PROMPT_PRODUCER:'/custom-export/profound/prompt/v1/healthCheck',
  PROFOUND_PROMPT_CONSUMER:'/custom-import/digital/prompt/v1/healthCheck',
  PROFOUND_PROMPT_EXPORTER_API:'/custom-export/profound/prompt-exporter/v1',
  PROFOUND_PROMPT_PRODUCER_API:'/custom-export/profound/prompt/v1',
  PROFOUND_PROMPT_CONSUMER_API:'/custom-import/digital/prompt/v1'
};
