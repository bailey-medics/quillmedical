"""Makes ``tests`` a package.

Without this, mypy resolves ``backend/tests/places.py`` as both
``places`` and ``tests.places`` and refuses to check any further. The
helper module is imported as ``tests.places``, so the package has to be
real rather than implicit.
"""
