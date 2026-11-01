#!/usr/bin/env python3
"""Score a pull request body for readability, in the two Flesch numbers.

The reader of every description here is dyslexic, and the British Dyslexia
Association's style guide gives two targets for a document meant for
general readers: a Flesch reading ease of about 70 to 80, and a
Flesch-Kincaid grade of about 5, reached "by using short sentences, not by
dumbing down vocabulary". Both numbers come from three counts, words,
sentences and syllables, so a body is scored in milliseconds and offline.

The scores are information, not a gate. A body full of real names such as
`GCP_DEPLOY_SERVICE_ACCOUNT` will sit above grade 5 whatever the sentences
do, and the reader's own verdict is the test that matters. So the markdown
that is not prose is taken out before counting: fenced code, code spans,
URLs, the HTML comment marker, the three triage labels, and the heading,
list and emphasis marks. Each bullet and each heading counts as a sentence
of its own, since a reader stops at the end of it whether or not it carries
a full stop.

Usage:
    python3 scripts/readability.py < body.md
    python3 scripts/readability.py body.md
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

#: The three lines that open every body. Their labels are scaffolding, not
#: prose, so they are removed and the sentence after each is kept.
TRIAGE_LABELS = ("Size:", "Look hardest at:", "Check for me:")

FENCED_CODE = re.compile(r"```.*?```", re.DOTALL)
CODE_SPAN = re.compile(r"`[^`\n]*`")
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
URL = re.compile(r"https?://\S+")
MARKDOWN_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
LINE_MARKS = re.compile(r"^\s*(?:#+\s*|[-*+]\s+|\d+\.\s+|>\s*)+", re.MULTILINE)
EMPHASIS = re.compile(r"[*_]{1,3}")
SENTENCE_END = re.compile(r"[.!?]+(?:\s+|$)")
LINE_ENDS_A_SENTENCE = re.compile(r"[.!?]\s*$")
WORD = re.compile(r"[A-Za-z][A-Za-z']*")
VOWEL_GROUP = re.compile(r"[aeiouy]+")


@dataclass(frozen=True)
class Scores:
    """The counts and the two numbers worked out from them."""

    words: int
    sentences: int
    syllables: int

    @property
    def reading_ease(self) -> float:
        words_per_sentence = self.words / self.sentences
        syllables_per_word = self.syllables / self.words

        return 206.835 - 1.015 * words_per_sentence - 84.6 * syllables_per_word

    @property
    def grade(self) -> float:
        words_per_sentence = self.words / self.sentences
        syllables_per_word = self.syllables / self.words

        return 0.39 * words_per_sentence + 11.8 * syllables_per_word - 15.59


def strip_markup(body: str) -> str:
    """Return the prose of a markdown body, with everything else removed."""
    text = FENCED_CODE.sub(" ", body)
    text = HTML_COMMENT.sub(" ", text)
    text = CODE_SPAN.sub(" ", text)
    text = URL.sub(" ", text)
    text = MARKDOWN_LINK.sub(r"\1", text)
    text = LINE_MARKS.sub("", text)
    text = EMPHASIS.sub("", text)

    for label in TRIAGE_LABELS:
        text = text.replace(label, "")

    return text


def count_syllables(word: str) -> int:
    """Count the vowel groups in a word, with the usual silent-e allowance."""
    lowered = word.lower().strip("'")
    groups = len(VOWEL_GROUP.findall(lowered))

    if lowered.endswith("e") and not lowered.endswith(("le", "ee")):
        groups -= 1

    return max(groups, 1)


def count_sentences(text: str) -> int:
    """Count sentences, treating every non-empty line as at least one."""
    total = 0

    for line in text.splitlines():
        if not WORD.search(line):
            continue

        ends = len(SENTENCE_END.findall(line))
        if not LINE_ENDS_A_SENTENCE.search(line):
            ends += 1

        total += ends

    return total


def score(body: str) -> Scores | None:
    """Score a body, or return None when it holds no words to score."""
    text = strip_markup(body)
    words = WORD.findall(text)

    if not words:
        return None

    return Scores(
        words=len(words),
        sentences=max(count_sentences(text), 1),
        syllables=sum(count_syllables(word) for word in words),
    )


def report(scores: Scores) -> str:
    return (
        f"Flesch reading ease: {scores.reading_ease:.0f} (aim 70 to 80)\n"
        f"Flesch-Kincaid grade: {scores.grade:.1f} (aim about 5)\n"
        f"{scores.words} words in {scores.sentences} sentences"
    )


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] != "-":
        body = Path(argv[1]).read_text(encoding="utf-8")
    else:
        body = sys.stdin.read()

    scores = score(body)

    if scores is None:
        print("readability: no words to score", file=sys.stderr)
        return 2

    print(report(scores))

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
