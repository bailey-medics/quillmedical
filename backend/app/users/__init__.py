"""Administering people's accounts: the rules, without the HTTP.

The people routes in ``app.main`` grew their rules inside the route
functions, where a rule can be reached only by building a whole request.
Each module here holds one part of those rules as plain functions: they
take ordinary values and a session, make the change or refuse it, and
know nothing of requests, responses or status codes. A route checks who
is asking, calls a function, and returns.

A refusal is raised as a :class:`app.users.errors.UserAdminError`, which
``app.main`` turns into the response.

See ``docs/docs/plans/2026-10-11-thin-routes-and-steady-frontend-tests-plan.md``.
"""
