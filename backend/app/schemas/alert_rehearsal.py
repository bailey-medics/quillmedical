"""Response model for the alert watcher's rehearsal route."""

from pydantic import BaseModel


class AverageOut(BaseModel):
    """The mean of a list of numbers.

    Attributes:
        count: How many numbers were given.
        mean: Their mean.
    """

    count: int
    mean: float
