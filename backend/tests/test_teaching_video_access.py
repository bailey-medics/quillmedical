"""Tests for Cloud CDN cookie signing and URL prefix construction.

The prefix is the entire authorisation boundary and the signature is
what the edge checks, so both are tested against values computed
independently rather than against the implementation's own output.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import UTC, datetime

import pytest

from app.features.teaching.video_access import (
    build_url_prefix,
    sign_cookie,
)

# 16 bytes, the length Cloud CDN keys use, as base64url without padding.
TEST_KEY_RAW = bytes(range(16))
TEST_KEY = base64.urlsafe_b64encode(TEST_KEY_RAW).decode().rstrip("=")
FIXED_EXPIRY = datetime.fromtimestamp(1800000000, UTC)


class TestBuildUrlPrefix:
    def test_builds_the_expected_prefix(self):
        assert (
            build_url_prefix("https://x.test/videos", 7, "module-1")
            == "https://x.test/videos/7/module-1/"
        )

    def test_trailing_slash_on_base_url_is_not_doubled(self):
        assert (
            build_url_prefix("https://x.test/videos/", 7, "module-1")
            == "https://x.test/videos/7/module-1/"
        )

    def test_prefix_always_ends_in_a_slash(self):
        """Cloud CDN matches the prefix literally.

        Without the trailing slash a cookie for ``module-1`` would also
        cover ``module-10``, so this is a real boundary, not tidiness.
        """
        prefix = build_url_prefix("https://x.test/videos", 1, "module-1")
        assert prefix.endswith("/")
        assert not "https://x.test/videos/1/module-10/".startswith(prefix)

    @pytest.mark.parametrize(
        "module_id",
        [
            "../secrets",
            "a/b",
            "a b",
            "",
            "mod%2E%2E",
            "mod\x00",
            "mod;rm",
        ],
    )
    def test_rejects_unsafe_module_ids(self, module_id):
        with pytest.raises(ValueError):
            build_url_prefix("https://x.test/videos", 1, module_id)

    @pytest.mark.parametrize("org_id", [0, -1, -999])
    def test_rejects_non_positive_org_ids(self, org_id):
        """An int, so the identifier pattern is the wrong check.

        ``_SAFE_MODULE_ID`` would accept "-1" and "0" quite happily.
        """
        with pytest.raises(ValueError):
            build_url_prefix("https://x.test/videos", org_id, "module-1")


class TestSignCookie:
    def test_signature_matches_an_independent_hmac(self):
        """The test that catches a subtle base64 or field-order slip.

        Such a mistake presents as a 403 at the edge with no
        diagnostics, so it is worth computing the expected value here
        rather than trusting the implementation to agree with itself.
        """
        cookie = sign_cookie(
            "https://x.test/videos/7/module-1/",
            FIXED_EXPIRY,
            "test-key",
            TEST_KEY,
        )
        policy, _, signature = cookie.rpartition(":Signature=")
        expected = (
            base64.urlsafe_b64encode(
                hmac.new(
                    TEST_KEY_RAW, policy.encode("utf-8"), hashlib.sha1
                ).digest()
            )
            .decode()
            .rstrip("=")
        )
        assert signature == expected

    def test_policy_has_cloud_cdns_exact_field_order(self):
        """Field order is specified, not stylistic.

        The edge recomputes the HMAC over the policy as written, so a
        reordering signs something nothing will verify.
        """
        cookie = sign_cookie(
            "https://x.test/videos/7/module-1/",
            FIXED_EXPIRY,
            "test-key",
            TEST_KEY,
        )
        policy = cookie.rpartition(":Signature=")[0]
        expected_prefix = (
            base64.urlsafe_b64encode(b"https://x.test/videos/7/module-1/")
            .decode()
            .rstrip("=")
        )
        assert policy == (
            f"URLPrefix={expected_prefix}"
            f":Expires=1800000000"
            f":KeyName=test-key"
        )

    def test_expiry_is_a_unix_timestamp(self):
        cookie = sign_cookie(
            "https://x.test/videos/1/m/", FIXED_EXPIRY, "k", TEST_KEY
        )
        assert ":Expires=1800000000:" in cookie

    def test_encoding_is_base64url_without_padding(self):
        """Standard base64 would be rejected by the edge.

        ``+`` and ``/`` are not URL-safe and ``=`` padding is not part
        of the format Cloud CDN parses.
        """
        cookie = sign_cookie(
            "https://x.test/videos/1/module-with-a-longer-name/",
            FIXED_EXPIRY,
            "k",
            TEST_KEY,
        )
        for field in cookie.split(":"):
            _, _, value = field.partition("=")
            assert "+" not in value
            assert "=" not in value

    def test_a_key_without_padding_is_accepted(self):
        """Cloud CDN presents keys base64url and unpadded.

        Terraform generates 16 bytes, which always encodes with a "=="
        suffix, so the key reaching the backend has had padding
        stripped and must be restored before decoding.
        """
        unpadded = TEST_KEY.rstrip("=")
        cookie = sign_cookie(
            "https://x.test/videos/1/m/", FIXED_EXPIRY, "k", unpadded
        )
        assert cookie.startswith("URLPrefix=")

    def test_different_prefixes_produce_different_signatures(self):
        """The property the whole design rests on.

        A cookie minted for one module must not validate for another.
        """
        a = sign_cookie(
            "https://x.test/videos/1/module-a/",
            FIXED_EXPIRY,
            "k",
            TEST_KEY,
        )
        b = sign_cookie(
            "https://x.test/videos/1/module-b/",
            FIXED_EXPIRY,
            "k",
            TEST_KEY,
        )
        assert a.rpartition(":Signature=")[2] != b.rpartition(":Signature=")[2]

    def test_a_different_key_produces_a_different_signature(self):
        other_raw = bytes(range(16, 32))
        other = base64.urlsafe_b64encode(other_raw).decode().rstrip("=")
        prefix = "https://x.test/videos/1/m/"
        mine = sign_cookie(prefix, FIXED_EXPIRY, "k", TEST_KEY)
        theirs = sign_cookie(prefix, FIXED_EXPIRY, "k", other)
        assert (
            mine.rpartition(":Signature=")[2]
            != theirs.rpartition(":Signature=")[2]
        )
