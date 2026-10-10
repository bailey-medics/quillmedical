"""Planted failing test. Do not merge."""


def test_planted_failure() -> None:
    planted = 1

    assert planted == 2, "planted to prove a failing test fails the build"
