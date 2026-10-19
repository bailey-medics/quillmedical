"""Every route asks who is calling, unless it is listed here as public.

A route with no guard is open to anybody who can reach the server, and
nothing about it looks wrong: it works, its tests pass and it reads like
its neighbours. So this walks every route the app serves and looks in its
dependency tree for a function that settles who the caller is. A route
without one must be named in `PUBLIC`, with the reason it is open.

The same walk checks the second rule: a route that changes something for
a signed-in caller must also check the CSRF token. There is no list of
exceptions to that one. A public route is left out by rule, having no
session for another site to ride on.

`PUBLIC` fails the build in both directions. A new route missing a guard
fails until it is guarded or listed, and an entry whose route has since
been guarded, renamed or removed fails until the entry is taken out, so
the list cannot drift from the code it describes.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.main import app
from app.utils.route_list import ServedRoute, dependency_calls, served_routes

RouteKey = tuple[str, str]

# Functions that settle who the caller is, and refuse a request with no
# valid session. There is one definition of each check, in `app.deps`,
# and every router takes it from there.
SIGNED_IN: frozenset[str] = frozenset(
    {
        "app.deps.get_current_user",
    }
)

# Functions that check the CSRF token. Each also needs a session.
CHECKS_CSRF: frozenset[str] = frozenset(
    {
        "app.deps.require_csrf",
    }
)

# Functions that settle which *service* is calling: a Cloud Run job
# proving itself with a Google identity token. No session and no cookie,
# so there is nothing for another site to ride on and no CSRF check to
# ask for.
SERVICE_CALLER: frozenset[str] = frozenset(
    {
        "app.deps.require_job_identity",
    }
)

GUARDS: frozenset[str] = SIGNED_IN | CHECKS_CSRF | SERVICE_CALLER

CHANGING: frozenset[str] = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Routes open to a caller with no session, and why each is.
PUBLIC: dict[RouteKey, str] = {
    ("GET", "/api/health"): "liveness check for the load balancer",
    ("POST", "/api/auth/login"): "signing in is how a session starts",
    ("POST", "/api/auth/register"): "registering comes before a session",
    ("POST", "/api/auth/refresh"): (
        "trades the refresh cookie for a new session, and checks that "
        "cookie itself"
    ),
    ("POST", "/api/auth/forgot-password"): (
        "a locked-out user has no session; always answers ok"
    ),
    ("POST", "/api/auth/reset-password"): (
        "carries the signed token from the reset email"
    ),
    ("POST", "/api/auth/verify-email"): (
        "carries the signed token from the verification email"
    ),
    ("POST", "/api/auth/resend-verification"): (
        "an unverified user has no session; always answers ok"
    ),
    ("POST", "/api/accept-invite"): (
        "an outside clinician or patient advocate joins one patient's "
        "record; the signed invite token in the link is the authority"
    ),
    ("POST", "/api/analytics/page-views"): (
        "anonymous by design: the sign-in cookie is not read, so a view "
        "cannot be tied to a person"
    ),
    ("POST", "/api/analytics/client-errors"): (
        "a crash on the login page must still be reportable; notes the "
        "user when there is one"
    ),
    ("GET", "/api/marketing/unsubscribe"): (
        "the link in a newsletter, carrying its own signed token"
    ),
    ("POST", "/api/marketing/unsubscribe"): (
        "one-click unsubscribe from a mail client, same signed token"
    ),
    ("GET", "/api/passport/assessor-invites/preview"): (
        "shows an invited assessor what they were asked, by invite token"
    ),
    ("POST", "/api/passport/assessor-invites/accept"): (
        "carries the assessor invite's own token"
    ),
    ("GET", "/api/teaching/public/modules"): (
        "modules open for registration, for the registration page"
    ),
    ("POST", "/api/teaching/public/validate-clinical-lead"): (
        "the registration page checks a clinical lead's email"
    ),
}


def _name(call: Callable[..., Any]) -> str:
    return f"{call.__module__}.{call.__qualname__}"


def _asks(route: ServedRoute) -> set[str]:
    """The names of every function a route's dependencies call."""
    return {_name(call) for call in dependency_calls(route.dependant)}


def _keys(route: ServedRoute) -> list[RouteKey]:
    return [(method, route.path) for method in sorted(route.methods)]


def _is_signed_in(route: ServedRoute) -> bool:
    return bool(_asks(route) & (SIGNED_IN | CHECKS_CSRF))


def _is_service_call(route: ServedRoute) -> bool:
    return bool(_asks(route) & SERVICE_CALLER)


def _asks_who_is_calling(route: ServedRoute) -> bool:
    return _is_signed_in(route) or _is_service_call(route)


def _checks_csrf(route: ServedRoute) -> bool:
    return bool(_asks(route) & CHECKS_CSRF)


def _open_routes() -> set[RouteKey]:
    """Every route that does not ask who is calling."""
    found: set[RouteKey] = set()

    for route in served_routes(app):
        if not _asks_who_is_calling(route):
            found.update(_keys(route))

    return found


def _changing_without_csrf() -> set[RouteKey]:
    """Every signed-in route that changes something without a CSRF check."""
    found: set[RouteKey] = set()

    for route in served_routes(app):
        if not _is_signed_in(route) or _checks_csrf(route):
            continue
        found.update(key for key in _keys(route) if key[0] in CHANGING)

    return found


class TestTheWalkSeesTheApp:
    """A walk that found no routes would pass every test below."""

    def test_it_finds_well_over_a_hundred_routes(self) -> None:
        assert len(list(served_routes(app))) > 100

    def test_a_route_known_to_be_guarded_reads_as_guarded(self) -> None:
        by_path = {route.path: route for route in served_routes(app)}

        assert _is_signed_in(by_path["/api/auth/me"])

    def test_a_route_known_to_be_open_reads_as_open(self) -> None:
        assert ("GET", "/api/health") in _open_routes()

    def test_a_route_known_to_be_a_service_call_reads_as_one(self) -> None:
        by_path = {route.path: route for route in served_routes(app)}
        route = by_path["/api/ci/teaching/transcode-complete"]

        assert _is_service_call(route)
        assert not _is_signed_in(route)

    def test_a_route_known_to_check_csrf_reads_as_checking(self) -> None:
        by_path = {route.path: route for route in served_routes(app)}

        assert _checks_csrf(by_path["/api/auth/change-password"])

    def test_every_guard_named_here_is_used_by_some_route(self) -> None:
        """A guard renamed in the code would leave a dead name here, and
        the routes that used it would read as open."""
        used: set[str] = set()

        for route in served_routes(app):
            used |= _asks(route)

        assert GUARDS - used == set()


class TestEveryRouteAsksWhoIsCalling:
    def test_no_route_is_open_without_being_listed(self) -> None:
        """A new route with no guard: guard it, or add it to PUBLIC
        with the reason it is open to everybody."""
        assert _open_routes() - set(PUBLIC) == set()

    def test_no_listed_route_has_since_been_guarded_or_removed(self) -> None:
        """An entry for a route that is now guarded, renamed or gone
        is a standing permission for whatever takes that path next."""
        assert set(PUBLIC) - _open_routes() == set()

    def test_every_public_route_says_why(self) -> None:
        assert [key for key, why in PUBLIC.items() if not why.strip()] == []


class TestChangingRoutesCheckCsrf:
    def test_no_route_changes_something_without_checking_csrf(self) -> None:
        """A route that changes something for a signed-in caller takes
        the CSRF dependency. There is no list to add it to instead."""
        assert _changing_without_csrf() == set()
