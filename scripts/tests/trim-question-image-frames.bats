#!/usr/bin/env bats
# Tests for trim-question-image-frames.py, which cuts the grey outline and
# white margin baked into teaching question images.
#
# The images are drawn here with Pillow, in a throwaway directory: a
# picture of coloured pixels with a frame put round it. Pillow is not a
# dependency of anything else in the repository, so every test is skipped
# where it is not installed.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../trim-question-image-frames.py"
    BANK="${BATS_TEST_TMPDIR}/repo/modules/polyps/assessment"
    mkdir -p "${BANK}/question_001"

    python3 -c "import PIL" 2>/dev/null || skip "Pillow is not installed"
}

# framed <file> <right margin>: a 100x60 red picture inside a one-pixel
# grey outline, with a white strip of the given width down the right.
framed() {
    python3 - "$1" "$2" <<'PY'
import sys
from PIL import Image

path, margin = sys.argv[1], int(sys.argv[2])
width, height = 100 + margin + 2, 62
image = Image.new("RGB", (width, height), (212, 212, 212))
image.paste((255, 255, 255), (1, 1, width - 1, height - 1))
image.paste((150, 40, 30), (1, 1, 101, 61))
image.save(path)
PY
}

size_of() {
    python3 -c "
import sys
from PIL import Image
print('%dx%d' % Image.open(sys.argv[1]).size)" "$1"
}

@test "a dry run reports the cut and changes nothing" {
    framed "${BANK}/question_001/wli.png" 20

    run python3 "${SCRIPT}" "${BATS_TEST_TMPDIR}/repo"

    [ "${status}" -eq 0 ]
    [[ "${output}" == *"would trim"* ]]
    [[ "${output}" == *"left 1, top 1, right 21, bottom 1"* ]]
    [[ "${output}" == *"Nothing was changed"* ]]
    [ "$(size_of "${BANK}/question_001/wli.png")" = "122x62" ]
}

@test "--write cuts the outline and the margin, leaving the picture" {
    framed "${BANK}/question_001/wli.png" 20
    framed "${BANK}/question_001/nbi.png" 7

    run python3 "${SCRIPT}" --write "${BATS_TEST_TMPDIR}/repo"

    [ "${status}" -eq 0 ]
    [ "$(size_of "${BANK}/question_001/wli.png")" = "100x60" ]
    [ "$(size_of "${BANK}/question_001/nbi.png")" = "100x60" ]
}

@test "a second run finds nothing left to cut" {
    framed "${BANK}/question_001/wli.png" 20
    python3 "${SCRIPT}" --write "${BATS_TEST_TMPDIR}/repo"

    run python3 "${SCRIPT}" --write "${BATS_TEST_TMPDIR}/repo"

    [ "${status}" -eq 0 ]
    [[ "${output}" == *"Trimmed 0 of 1 images; 1 had no frame"* ]]
    [ "$(size_of "${BANK}/question_001/wli.png")" = "100x60" ]
}

@test "an image with no frame is left alone" {
    python3 -c "
import sys
from PIL import Image
Image.new('RGB', (100, 60), (150, 40, 30)).save(sys.argv[1])" \
        "${BANK}/question_001/wli.png"

    run python3 "${SCRIPT}" --write "${BATS_TEST_TMPDIR}/repo"

    [ "${status}" -eq 0 ]
    [[ "${output}" == *"1 had no frame"* ]]
    [ "$(size_of "${BANK}/question_001/wli.png")" = "100x60" ]
}

@test "a cut of more than a quarter is held for review, not written" {
    # A white strip wider than the picture's quarter: more likely picture
    framed "${BANK}/question_001/wli.png" 60

    run python3 "${SCRIPT}" --write "${BATS_TEST_TMPDIR}/repo"

    [ "${status}" -eq 1 ]
    [[ "${output}" == *"REVIEW"* ]]
    [[ "${output}" == *"1 held for review"* ]]
    [ "$(size_of "${BANK}/question_001/wli.png")" = "162x62" ]
}

@test "images outside a question directory are not touched" {
    framed "${BANK}/certificate-blank.png" 20
    framed "${BANK}/question_001/wli.png" 20

    run python3 "${SCRIPT}" --write "${BATS_TEST_TMPDIR}/repo"

    [ "${status}" -eq 0 ]
    [ "$(size_of "${BANK}/certificate-blank.png")" = "122x62" ]
    [ "$(size_of "${BANK}/question_001/wli.png")" = "100x60" ]
}

@test "a path with no question images is an error" {
    run python3 "${SCRIPT}" "${BATS_TEST_TMPDIR}"/repo/modules/polyps/assessment/question_001

    [ "${status}" -eq 2 ]
    [[ "${output}" == *"No question images found"* ]]
}
