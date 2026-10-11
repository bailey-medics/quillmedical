"""Listing and changing patients: the rules, without the HTTP.

A patient's demographics are held in FHIR and reached through
:mod:`app.fhir_client`. What the core database knows of a patient is
where they are cared for, who outside those org units has been given
access, and whether the record has been deactivated.

Each module here holds one part of the rules the patient routes in
``app.main`` grew inside themselves, as plain functions: they take
ordinary values and a session, and know nothing of requests, responses
or status codes. A route checks who is asking, talks to FHIR, calls a
function, and returns.

The calls to FHIR stay in the routes. There is no errors module: the
refusals these routes give are each an answer to what FHIR said, so
they are raised where FHIR is asked.

See ``docs/docs/plans/2026-10-11-thin-routes-and-steady-frontend-tests-plan.md``.
"""
