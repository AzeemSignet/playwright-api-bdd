# Purpose: Validate simple API auth and response status handling.
Feature: Feature: Real server auth echo checks

@sample
# Verifies a basic authenticated POST request returns a successful status.
Scenario: Validate successful API response
    Given API authentication header is present
    When I send a "POST" request to "/login" with request body1
    Then response status should be 2xx

@sample-token
# Checks GET responses for different Authorization token values (outline).
Scenario Outline: Validate successful API response with token
    Given API authentication header is "" present     
      | Authorization      | <token_value>    |
    When I send a "GET" request to ""
    Then response status should be "<expected_status>"
    Then I print the response

    Examples:
      | token_value                    | expected_status |
      | Bearer test-token-123          | 2xx             |
      |                                | 4xx             |
      | $%^Invalid                     | 4xx             |

@encrypt-test
# Ensures payload encryption and decryption round-trip works.
  Scenario: Encrypt and decrypt payload round-trip
    Given a plaintext payload "hello encryption demo"
    When I encrypt the payload using base64 key "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    And I print the encrypted payload
    And I decrypt the payload using base64 key "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    Then decrypted payload should equal original
    And encrypted payload should not equal original
    
@encrypt-test
# Confirms invalid encrypted payloads fail to decrypt.
  Scenario: Decrypting invalid payload fails
    Given an invalid encrypted payload "not-a-valid-payload"
    When I try to decrypt with base64 key "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    Then decryption should fail

@token-real
  Scenario Outline: Send <mechanism> authentication header to real server
    Given base URL is "https://httpbin.org"
    Given API authentication header is "" present
      | <header_name> | <header_value> |
    When I send a "GET" request to "/anything"
    Then response status should be "2xx"
    And mock response should include header "<expected_header>" with value "<expected_value>"

    Examples:
      | mechanism | header_name   | header_value          | expected_header | expected_value        |
      | Basic     | Authorization | Basic ZGVtbzpkZW1v    | Authorization  | Basic ZGVtbzpkZW1v    |
      | Bearer    | Authorization | Bearer demo-token-123 | Authorization  | Bearer demo-token-123 |
      | API Key   | X-API-Key     | api-key-123           | X-API-Key      | api-key-123           |
      | Signature | X-Signature   | demo-signature-abc    | X-Signature    | demo-signature-abc    |
      | SSO       | X-SSO-Token   | sso-token-789         | X-SSO-Token    | sso-token-789         |


