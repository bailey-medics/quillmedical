"""Permanent, flag-gated dummy endpoints for the API-compatibility test harness.

These exist solely to re-exercise the oasdiff/api-compatibility CI chain
(fixed in PR #379) on demand, without ever touching a real production
endpoint again. Only registered when ``TEST_API_ENDPOINTS_ENABLED`` is true
— always false in real deployments, set true by CI when dumping OpenAPI
specs for the breaking-change check. See item 19 of
``docs/docs/plans/2026-08-09-alembic-review-and-revisions-plan.md``.
"""

from fastapi import APIRouter
from pydantic import BaseModel

test_api_router = APIRouter(prefix="/test", tags=["test"])

# Flip any of these to True in a test PR to remove that property from its
# response — a genuine response-property-removed breaking change for
# oasdiff to catch. MUTATE_REMOVE_MESSAGE_1/_DETAIL_1 share endpoint 1 (two
# breaking changes at once), MUTATE_REMOVE_SUMMARY_2 is on endpoint 2 (one
# breaking change spread across two endpoints). Flip back to False before
# merging. Deliberately plain source constants, never env vars: CI dumps
# the OpenAPI spec for both the PR branch and `main` in the same job with
# identical env, so only an actual source diff between the two checkouts
# gives oasdiff anything to detect.
MUTATE_REMOVE_MESSAGE_1 = True
MUTATE_REMOVE_DETAIL_1 = False
MUTATE_REMOVE_SUMMARY_2 = False


class TestNonBreakingResponse(BaseModel):
    """Response for the control endpoint, never mutated between scenarios."""

    message: str


class TestBreakingResponse1(BaseModel):
    """Response for the endpoint deliberately mutated per test scenario."""

    if not MUTATE_REMOVE_MESSAGE_1:
        message: str
    if not MUTATE_REMOVE_DETAIL_1:
        detail: str


class TestBreakingResponse2(BaseModel):
    """Response for the second mutable endpoint, toggled independently of
    ``TestBreakingResponse1`` above."""

    if not MUTATE_REMOVE_SUMMARY_2:
        summary: str


@test_api_router.get("/non-breaking-api")
def non_breaking_api() -> TestNonBreakingResponse:
    """Control endpoint proving unrelated endpoints are unaffected by a
    breaking-change PR touching ``breaking_api``/``breaking_api_2`` below."""
    return TestNonBreakingResponse(
        message="This is a test response from the non-breaking api"
    )


@test_api_router.get("/breaking-api")
def breaking_api() -> TestBreakingResponse1:
    """Endpoint whose schema is deliberately mutated per test scenario."""
    body: dict[str, str] = {}
    if not MUTATE_REMOVE_MESSAGE_1:
        body["message"] = "This is a test response from the breaking api"
    if not MUTATE_REMOVE_DETAIL_1:
        body["detail"] = "Additional detail from the breaking api"
    return TestBreakingResponse1(**body)


@test_api_router.get("/breaking-api-2")
def breaking_api_2() -> TestBreakingResponse2:
    """Second endpoint whose schema is deliberately mutated per test
    scenario, independently of ``breaking_api`` above — lets one commit
    exercise a single breaking change spread across two endpoints."""
    body: dict[str, str] = {}
    if not MUTATE_REMOVE_SUMMARY_2:
        body["summary"] = (
            "This is a test response from the second breaking api"
        )
    return TestBreakingResponse2(**body)
