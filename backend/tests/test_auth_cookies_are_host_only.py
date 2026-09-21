"""Auth cookies are host-only unless a domain is configured.

`COOKIE_DOMAIN` used to be set to `.quill-medical.com` in every deployed
environment, which told the browser to send a cookie written by one
subdomain to all the others. One environment could then set a session
cookie that another would accept. The setting is gone from the Terraform
and the Compose file, so the default of `None` applies and every cookie
is host-only.

These tests pin the behaviour the deployment now depends on: a `Set-Cookie`
header with no `Domain` attribute. They are about the default, not about
the value, so they do not care what any particular environment sets.
"""

from fastapi.testclient import TestClient

from app.config import settings
from app.models import User


class TestAuthCookiesAreHostOnly:
    """Login and logout must not scope their cookies to a parent domain."""

    def test_cookie_domain_defaults_to_none(self) -> None:
        """An unset COOKIE_DOMAIN is what makes the cookies host-only."""
        assert settings.COOKIE_DOMAIN is None

    def test_login_sets_no_domain_attribute(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """No Set-Cookie header from login carries a Domain."""
        response = test_client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "TestPassword123!"},
        )
        assert response.status_code == 200

        headers = response.headers.get_list("set-cookie")
        assert headers, "login set no cookies"
        for header in headers:
            assert "domain=" not in header.lower(), header

    def test_login_sets_the_three_auth_cookies(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """Guards the test above: it passes vacuously if nothing is set."""
        response = test_client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "TestPassword123!"},
        )
        assert response.status_code == 200

        names = {
            header.split("=", 1)[0].strip()
            for header in response.headers.get_list("set-cookie")
        }
        assert {"access_token", "refresh_token", "XSRF-TOKEN"} <= names

    def test_logout_clears_without_a_domain(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """A delete_cookie naming a domain would not clear a host-only one."""
        login = test_client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "TestPassword123!"},
        )
        assert login.status_code == 200
        csrf = test_client.cookies.get("XSRF-TOKEN")
        assert csrf

        response = test_client.post(
            "/api/auth/logout", headers={"X-CSRF-Token": csrf}
        )
        assert response.status_code == 200

        headers = response.headers.get_list("set-cookie")
        assert headers, "logout cleared no cookies"
        for header in headers:
            assert "domain=" not in header.lower(), header
