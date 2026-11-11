#!/usr/bin/env bash
# Sort the arguments `just sa` was given, and print the brand and whether
# to build: `quill no`, `ldd yes`.
#
# The recipe takes two optional arguments in either order, told apart by
# value rather than position: `b` means build the images, anything else is
# the brand. So `just sa`, `just sa b`, `just sa ldd` and `just sa ldd b`
# all work, and `just sa b` means what it always has. A second argument by
# position could not be added without breaking that.
#
# Refuses an unknown brand, or two brands, before anything starts, so a
# mistyped name costs nothing. The list is written out by hand, as `just sb`
# does, and widened when a brand is ready; the backend checks again against
# shared/brand.yaml when it starts.

set -euo pipefail

BRANDS="quill ldd"

brand=""
build="no"

for arg in "$@"; do
    if [ "${arg}" = "b" ]; then
        build="yes"
        continue
    fi

    if [ -n "${brand}" ]; then
        echo "✗ One brand at a time: '${brand}' and '${arg}' were both given." >&2
        exit 1
    fi

    brand="${arg}"
done

brand="${brand:-quill}"

case " ${BRANDS} " in
    *" ${brand} "*) ;;
    *)
        echo "✗ Unknown brand '${brand}': quill or ldd." >&2
        exit 1
        ;;
esac

echo "${brand} ${build}"
