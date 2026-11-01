#!/usr/bin/env bash
# Refuse details of a home or dev set-up in tracked files.
#
# The repository is public and its docs site publishes every page, so an
# address on a home network or a tailnet, a tailnet's name or a device's
# MAC address would be published with it. The patterns here describe a
# kind of detail, never anybody's own, so they are safe to commit and CI
# runs them for every push.
#
# The literals only a list can know, such as a laptop's hostname, are in
# local/home-details-denylist, which is never committed. It is read when
# this runs outside CI, and made with a header explaining it the first
# time. See .claude/rules/home-details.md.
#
# Usage: check-home-details.sh [--all | FILE...]
#
# A match is reported as path:line and the rule's name, never the text,
# because CI logs are as public as the files.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# One octet, and a last octet that is not 0: an address ending .0 names
# a network, such as a peering range in infra/, not a machine.
octet='(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'
host_octet='(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]?)'

# The private ranges, and 100.64.0.0/10, the one Tailscale assigns from.
# Not followed by a slash, so a CIDR passes: a subnet is a design, not a
# place. A full stop ending a sentence still counts as the end.
private_prefix="(10\\.${octet}\\.${octet}|172\\.(1[6-9]|2[0-9]|3[01])\\.${octet}|192\\.168\\.${octet}|100\\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\\.${octet})"
private_address="(^|[^0-9.])${private_prefix}\\.${host_octet}([^0-9./]|\\.([^0-9]|\$)|\$)"

# A named tailnet. The bare suffix, as in Vite's allowed hosts, names no
# tailnet and passes.
tailnet_name='[a-z0-9-]+\.ts\.net'

# Tailscale's IPv6 addresses all start with this prefix. The last colon
# is a bracket expression so that this line does not match itself.
tailnet_ipv6='fd7a:115c:a1e0[:]'

# Six pairs of hex digits, not part of a longer run such as a
# certificate fingerprint.
mac_address='(^|[^0-9a-f:-])([0-9a-f]{2}[:-]){5}[0-9a-f]{2}([^0-9a-f:-]|$)'

rule_names=("private address" "tailnet name" "tailnet IPv6 address" "MAC address")
rule_patterns=("$private_address" "$tailnet_name" "$tailnet_ipv6" "$mac_address")

denylist_header='# Home details this machine refuses to commit, one per line.
#
# Read by scripts/check-home-details.sh, which pre-commit runs. Put here
# what only a list can know: the hostnames of your own devices, your
# router'"'"'s make or model, your Wi-Fi name. Matching ignores case. This
# file is in local/, which is never committed, and the check never
# prints what it matched. See .claude/rules/home-details.md.'

# Prints the denylist's path, making it with its header the first time.
# Prints nothing under CI, which has no local/ and needs none.
denylist_path() {
    if [ -n "${CI:-}" ]; then
        return
    fi

    local path
    path="$("${script_dir}/local-path.sh")/home-details-denylist"

    if [ ! -e "$path" ]; then
        printf '%s\n' "$denylist_header" > "$path"
        echo "Made ${path} for this machine's own home details." >&2
    fi

    echo "$path"
}

# A test file's addresses are fixtures, made up by definition.
is_exempt() {
    case "$1" in
        *_test.py | *.test.ts | *.test.tsx | *.bats) return 0 ;;
    esac

    return 1
}

# Reads grep's -Z output, a file name and NUL then line:text, and prints
# path:line with the rule's name. The text is dropped here.
report() {
    local name="$1" file rest

    while IFS= read -r -d '' file && IFS= read -r rest; do
        echo "${file}:${rest%%:*}: home detail (${name})"
    done
}

files=()

if [ "${1:-}" = "--all" ]; then
    while IFS= read -r -d '' file; do
        files+=("$file")
    done < <(git ls-files -z)
else
    files=("$@")
fi

checked=()

for file in "${files[@]}"; do
    if [ -f "$file" ] && ! is_exempt "$file"; then
        checked+=("$file")
    fi
done

if [ "${#checked[@]}" -eq 0 ]; then
    exit 0
fi

findings=""

for i in "${!rule_names[@]}"; do
    findings+="$(grep -nIHZiE -- "${rule_patterns[$i]}" "${checked[@]}" \
        | report "${rule_names[$i]}" || true)"$'\n'
done

denylist="$(denylist_path)"

if [ -n "$denylist" ]; then
    literals="$(grep -vE '^[[:space:]]*(#|$)' "$denylist" || true)"

    if [ -n "$literals" ]; then
        findings+="$(grep -nIHZiF -- "$literals" "${checked[@]}" \
            | report "a literal from local/home-details-denylist" || true)"$'\n'
    fi
fi

findings="$(printf '%s' "$findings" | grep -v '^$' \
    | sort -u -t: -k1,1 -k2,2n || true)"

if [ -n "$findings" ]; then
    echo "$findings"
    echo "These lines hold details of a home or dev set-up; see .claude/rules/home-details.md." >&2
    exit 1
fi
