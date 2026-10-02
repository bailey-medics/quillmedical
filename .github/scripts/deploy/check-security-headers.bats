#!/usr/bin/env bats
# Tests for check-security-headers.sh – the deploy pipeline's check that the
# live site still sends its security headers.
#
# The curl call (response_headers) is stubbed so the check can be tested
# without network access.

# shellcheck disable=SC2329

setup() {
  source "${BATS_TEST_DIRNAME}/check-security-headers.sh"
}

all_headers() {
  echo "HTTP/2 200"
  echo "content-type: application/json"
  echo "x-content-type-options: nosniff"
  echo "x-frame-options: SAMEORIGIN"
  echo "content-security-policy: default-src 'none'; frame-ancestors 'self'"
  echo "strict-transport-security: max-age=63072000; includeSubDomains"
}

@test "passes when every header is present" {
  response_headers() { all_headers; }

  run main "http://www.example.com/api/health"

  [ "$status" -eq 0 ]
  [[ "$output" == *"Security headers present: http://www.example.com/api/health"* ]]
}

@test "matches header names whatever their case" {
  response_headers() {
    echo "HTTP/1.1 200 OK"
    echo "X-Content-Type-Options: nosniff"
    echo "X-FRAME-OPTIONS: DENY"
    echo "Content-Security-Policy: default-src 'self'"
    echo "Strict-Transport-Security: max-age=63072000"
  }

  run main "http://www.example.com/"

  [ "$status" -eq 0 ]
}

@test "fails and names the header when one is missing" {
  response_headers() { all_headers | grep -v "x-frame-options"; }

  run main "http://www.example.com/api/health"

  [ "$status" -ne 0 ]
  [[ "$output" == *"Missing X-Frame-Options: http://www.example.com/api/health"* ]]
  [[ "$output" != *"Missing X-Content-Type-Options"* ]]
}

@test "names every missing header, not only the first" {
  response_headers() {
    echo "HTTP/2 200"
    echo "content-type: application/json"
  }

  run main "http://www.example.com/api/health"

  [ "$status" -ne 0 ]
  [[ "$output" == *"Missing X-Content-Type-Options"* ]]
  [[ "$output" == *"Missing X-Frame-Options"* ]]
  [[ "$output" == *"Missing Content-Security-Policy"* ]]
  [[ "$output" == *"Missing Strict-Transport-Security"* ]]
}

@test "is not fooled by a header name inside another header's value" {
  response_headers() {
    all_headers | grep -v "^x-frame-options"
    echo "x-debug: x-frame-options: DENY"
  }

  run main "http://www.example.com/api/health"

  [ "$status" -ne 0 ]
  [[ "$output" == *"Missing X-Frame-Options"* ]]
}

@test "fails when the request returns nothing at all" {
  response_headers() { :; }

  run main "http://www.example.com/api/health"

  [ "$status" -ne 0 ]
  [[ "$output" == *"Missing Strict-Transport-Security"* ]]
}

@test "errors when url is missing" {
  run main

  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage: check-security-headers.sh"* ]]
}
