"""The framework fixtures as a catalogue, read from their files, for tests.

For a test of code that takes a
:class:`~app.features.passport.catalogue.StoredCatalogue` but never
touches the database, such as the passport service. It reads the files
in ``shared/framework-fixtures/`` the way the framework sync does, so it
holds exactly what ``stored_frameworks`` stores. A test that goes through a
route, and so reads the tables, uses the ``stored_frameworks`` fixture
in ``backend/conftest.py`` instead.
"""

from __future__ import annotations

from functools import cache

from app.cbac.competencies import _load_catalogue
from app.features.passport.catalogue import StoredCatalogue
from app.paths import FRAMEWORK_FIXTURES_DIR


@cache
def files_catalogue() -> StoredCatalogue:
    """Every framework fixture, as the tables would hold it.

    Read once and shared: a catalogue is never changed after it is made.
    """
    entries, frameworks = _load_catalogue(FRAMEWORK_FIXTURES_DIR)
    by_framework = {
        framework.id: [e for e in entries if e.framework_id == framework.id]
        for framework in frameworks
    }

    return StoredCatalogue(
        frameworks={
            framework.id: framework
            for framework in sorted(
                frameworks, key=lambda f: f.name.casefold()
            )
        },
        competencies=by_framework,
        entries={
            entry.id: entry
            for items in by_framework.values()
            for entry in items
        },
    )
