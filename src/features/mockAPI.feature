Feature: Mock API authentication mechanisms
	# Purpose: Validate that auth headers are sent for different mechanisms using the mock echo endpoint.
	# Environment: Use BASE_URL=mock://local to run without a server.
	# Step-to-code map:
	# - Given API authentication header is "" present
	#   -> src/step-definitions/stiboapisteps.ts (setAuthContext in stiboApiHelper)
	# - When I send a "GET" request to "/auth/echo"
	#   -> src/step-definitions/stiboapisteps.ts (sendRequest in stiboApiHelper)
	# - Then response status should be "2xx"
	#   -> src/step-definitions/stiboapisteps.ts (logResponse + validateStatusRange)
	# - And mock response should include header "X" with value "Y"
	#   -> src/step-definitions/mockAuthSteps.ts (getResponse + getEchoedHeader)

	@mock-auth @positive
	Scenario Outline: Send <mechanism> authentication header
		Given base URL is "mock://local"
		# Calls setAuthContext(flag, headers) to build the request headers.
		Given API authentication header is "" present
			| <header_name> | <header_value> |
		# Calls sendRequest(method, endpoint) with GET and /auth/echo.
		When I send a "GET" request to "/auth/echo"
		# Calls logResponse() and validateStatusRange() to assert 2xx.
		Then response status should be "2xx"
		# Parses mock echo response JSON and validates the header value.
		And mock response should include header "<expected_header>" with value "<expected_value>"

		Examples:
			| mechanism | header_name   | header_value                       | expected_header | expected_value                    |
			| Basic     | Authorization | Basic ZGVtbzpkZW1v                 | Authorization  | Basic ZGVtbzpkZW1v                 |
			| Bearer    | Authorization | Bearer demo-token-123              | Authorization  | Bearer demo-token-123              |
			| API Key   | X-API-Key     | api-key-123                        | X-API-Key      | api-key-123                        |
			| Signature | X-Signature   | demo-signature-abc                 | X-Signature    | demo-signature-abc                 |
			| SSO       | X-SSO-Token   | sso-token-789                      | X-SSO-Token    | sso-token-789                      |

	@mock-auth @oauth @positive
	Scenario: OAuth client credentials header
		# Stores OAuth config in ENV (oauthSteps.ts) and validates required values.
		Given OAuth client credentials are configured
			| OAUTH_TOKEN_URL     | mock://oauth-token |
			| OAUTH_CLIENT_ID     | demo-client-id     |
			| OAUTH_CLIENT_SECRET | demo-client-secret |
		# Uses the mock token flow and sets Authorization via setAuthContext.
		And API authentication header is "" present
		# Sends GET /auth/echo to the mock endpoint.
		When I send a "GET" request to "/auth/echo"
		# Asserts 2xx and validates the echoed Authorization header value.
		Then response status should be "2xx"
		And mock response should include header "Authorization" with value "Bearer demo-access-token"

	@encrypt-test @positive
	# Ensures payload encryption and decryption round-trip works.
	Scenario: Encrypt and decrypt payload round-trip
		# Stores plaintext in the scenario world.
		Given a plaintext payload "hello encryption demo"
		# Calls encryptText() from encryptionHelper.
		When I encrypt the payload using base64 key "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
		# Logs the encrypted payload into the report output.
		And I print the encrypted payload
		# Calls decryptText() from encryptionHelper.
		And I decrypt the payload using base64 key "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
		Then decrypted payload should equal original
		And encrypted payload should not equal original

	@encrypt-test @negative @technical-exception
	# Confirms invalid encrypted payloads fail to decrypt.
	Scenario: Decrypting invalid payload fails
		# Stores an invalid encrypted payload in the scenario world.
		Given an invalid encrypted payload "not-a-valid-payload"
		# Attempts decryptText() and captures the thrown error.
		When I try to decrypt with base64 key "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
		Then decryption should fail
