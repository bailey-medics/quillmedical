#!/usr/bin/env bats
# Tests for how stack-status.py reads CI checks into its two marks.
#
# These call `best_conclusion_per_check` directly with a hand-built
# statusCheckRollup, so nothing reaches GitHub. The file name has a hyphen,
# so the module is loaded by path rather than imported.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../stack-status.py"
}

# Prints the kind stack-status gives one check name, from a JSON rollup.
kind_of() {
    python3 - "$SCRIPT" "$1" "$2" <<'PY'
import importlib.util, json, sys

spec = importlib.util.spec_from_file_location("stack_status", sys.argv[1])
module = importlib.util.module_from_spec(spec)
# Registered first: its dataclasses look their own module up by name.
sys.modules["stack_status"] = module
spec.loader.exec_module(module)

best = module.best_conclusion_per_check(json.loads(sys.argv[3]))
print(best[sys.argv[2]][0])
PY
}

@test "a cancelled run superseded by one still going reads as pending" {
    # Two pushes a second apart start two runs and CI cancels the older.
    # GitHub hides that run; this showed ✗ ✗ while the real one ran.
    run kind_of "E2E (Playwright)" '[
        {"name": "E2E (Playwright)", "status": "COMPLETED", "conclusion": "CANCELLED"},
        {"name": "E2E (Playwright)", "status": "IN_PROGRESS", "conclusion": ""}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "pending" ]
}

@test "a cancelled run superseded by one that passed reads as passing" {
    run kind_of "E2E (Playwright)" '[
        {"name": "E2E (Playwright)", "status": "COMPLETED", "conclusion": "CANCELLED"},
        {"name": "E2E (Playwright)", "status": "COMPLETED", "conclusion": "SUCCESS"}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "passing" ]
}

@test "a cancellation with nothing to replace it is still a failure" {
    # GitHub reads a cancelled required check as a failure, so this must
    # still draw the eye.
    run kind_of "E2E (Playwright)" '[
        {"name": "E2E (Playwright)", "status": "COMPLETED", "conclusion": "CANCELLED"}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "failing" ]
}

@test "a failure left behind by a cancelled run does not outrank the pass" {
    # The real entries on #1829, 12 October 2026. A stack is pushed twice
    # when it lands and CI cancels the older run. In that run the three
    # legs say CANCELLED, and the job that sums them up says FAILURE,
    # because the legs it waited for did not pass. GitHub shows only the
    # newest run, which passed; this showed a cross on ten pull requests.
    run kind_of "Storybook interaction tests" '[
        {"name": "Storybook interaction tests", "status": "COMPLETED", "conclusion": "SKIPPED",
         "detailsUrl": "https://github.com/o/r/actions/runs/100/job/1"},
        {"name": "Storybook interaction tests (1/3)", "status": "COMPLETED", "conclusion": "CANCELLED",
         "detailsUrl": "https://github.com/o/r/actions/runs/200/job/2"},
        {"name": "Storybook interaction tests", "status": "COMPLETED", "conclusion": "FAILURE",
         "detailsUrl": "https://github.com/o/r/actions/runs/200/job/3"},
        {"name": "Storybook interaction tests (1/3)", "status": "COMPLETED", "conclusion": "SUCCESS",
         "detailsUrl": "https://github.com/o/r/actions/runs/300/job/4"},
        {"name": "Storybook interaction tests", "status": "COMPLETED", "conclusion": "SUCCESS",
         "detailsUrl": "https://github.com/o/r/actions/runs/300/job/5"}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "passing" ]
}

@test "a failure in a cancelled run stands when no other run has reported" {
    # Nothing has replaced it, so it is all there is to go on.
    run kind_of "Storybook interaction tests" '[
        {"name": "Storybook interaction tests (1/3)", "status": "COMPLETED", "conclusion": "CANCELLED",
         "detailsUrl": "https://github.com/o/r/actions/runs/200/job/2"},
        {"name": "Storybook interaction tests", "status": "COMPLETED", "conclusion": "FAILURE",
         "detailsUrl": "https://github.com/o/r/actions/runs/200/job/3"}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "failing" ]
}

@test "a failure in a run nothing cancelled still outranks a later pass" {
    # A real failure, re-run or not: no check in its run was cancelled,
    # so the run is not a dead one and what it said counts.
    run kind_of "Python unit" '[
        {"name": "Python unit", "status": "COMPLETED", "conclusion": "FAILURE",
         "detailsUrl": "https://github.com/o/r/actions/runs/200/job/3"},
        {"name": "Python unit", "status": "COMPLETED", "conclusion": "SUCCESS",
         "detailsUrl": "https://github.com/o/r/actions/runs/300/job/5"}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "failing" ]
}

@test "a cancelled run still going elsewhere reads as pending, not failed" {
    run kind_of "Storybook interaction tests" '[
        {"name": "Storybook interaction tests (1/3)", "status": "COMPLETED", "conclusion": "CANCELLED",
         "detailsUrl": "https://github.com/o/r/actions/runs/200/job/2"},
        {"name": "Storybook interaction tests", "status": "COMPLETED", "conclusion": "FAILURE",
         "detailsUrl": "https://github.com/o/r/actions/runs/200/job/3"},
        {"name": "Storybook interaction tests", "status": "IN_PROGRESS", "conclusion": "",
         "detailsUrl": "https://github.com/o/r/actions/runs/300/job/5"}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "pending" ]
}

@test "a real failure beside a pass still reads as failing" {
    run kind_of "Python unit" '[
        {"name": "Python unit", "status": "COMPLETED", "conclusion": "SUCCESS"},
        {"name": "Python unit", "status": "COMPLETED", "conclusion": "FAILURE"}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "failing" ]
}

@test "a draft run's skip is outranked by the ready run's pass" {
    run kind_of "E2E (Playwright)" '[
        {"name": "E2E (Playwright)", "status": "COMPLETED", "conclusion": "SKIPPED"},
        {"name": "E2E (Playwright)", "status": "COMPLETED", "conclusion": "SUCCESS"}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "passing" ]
}

# Prints "heavy" or "fast" for one check name.
tier_of() {
    python3 - "$SCRIPT" "$1" <<'PY'
import importlib.util, sys

spec = importlib.util.spec_from_file_location("stack_status", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules["stack_status"] = module
spec.loader.exec_module(module)

print("heavy" if module.is_heavy(sys.argv[2]) else "fast")
PY
}

@test "a leg of the sharded Storybook job counts as heavy" {
    # ci.yml fans the job out, so it reports as "… (2/3)" beside the gate
    # job that keeps the plain name. Read as fast, a draft's skipped legs
    # would sit in the fast mark.
    run tier_of "Storybook interaction tests (2/3)"
    [ "$status" -eq 0 ]
    [ "$output" = "heavy" ]
}

@test "the Storybook gate job still counts as heavy" {
    run tier_of "Storybook interaction tests"
    [ "$status" -eq 0 ]
    [ "$output" = "heavy" ]
}

@test "a leg of the sharded E2E job counts as heavy" {
    run tier_of "E2E (Playwright) (3/3)"
    [ "$status" -eq 0 ]
    [ "$output" = "heavy" ]
}

@test "the E2E gate job still counts as heavy" {
    run tier_of "E2E (Playwright)"
    [ "$status" -eq 0 ]
    [ "$output" = "heavy" ]
}

@test "the Storybook build, in the fast tier, is not caught by the prefix" {
    run tier_of "typescript_checks (storybook:build)"
    [ "$status" -eq 0 ]
    [ "$output" = "fast" ]
}

# Prints "name=number" for each numbered branch, from a JSON list of
# branches written top of the stack first, as the script holds them.
numbers_of() {
    python3 - "$SCRIPT" "$1" <<'PY'
import importlib.util, json, sys

spec = importlib.util.spec_from_file_location("stack_status", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules["stack_status"] = module
spec.loader.exec_module(module)

branches = [
    module.Branch(
        name=entry["name"],
        is_current=False,
        is_merged=entry.get("merged", False),
        is_queued=False,
        needs_rebase=False,
    )
    for entry in json.loads(sys.argv[2])
]
for name, number in module.number_branches(branches).items():
    print(f"{name}={number}")
PY
}

@test "branches are numbered from the bottom of the stack" {
    # A new branch goes on top, so counting from the bottom leaves the
    # numbers already on screen where they were.
    run numbers_of '[{"name": "top"}, {"name": "middle"}, {"name": "bottom"}]'
    [ "$status" -eq 0 ]
    [ "$output" = "$(printf 'bottom=1\nmiddle=2\ntop=3')" ]
}

@test "a merged branch takes no number" {
    run numbers_of '[{"name": "top"}, {"name": "landed", "merged": true}]'
    [ "$status" -eq 0 ]
    [ "$output" = "top=1" ]
}

@test "a tall stack runs on into two-digit numbers" {
    # The watch waits for a second digit when one could follow, so a
    # tenth and eleventh branch must carry a number to reach.
    run numbers_of '[
        {"name": "k"}, {"name": "j"}, {"name": "i"}, {"name": "h"},
        {"name": "g"}, {"name": "f"}, {"name": "e"}, {"name": "d"},
        {"name": "c"}, {"name": "b"}, {"name": "a"}
    ]'
    [ "$status" -eq 0 ]
    [[ "$output" == *"a=1"* ]]
    [[ "$output" == *"j=10"* ]]
    [[ "$output" == *"k=11"* ]]
}

# Prints the branches of a spent stack, or "not spent", from stack JSON.
spent_of() {
    python3 - "$SCRIPT" "$1" <<'PY'
import importlib.util, json, sys

spec = importlib.util.spec_from_file_location("stack_status", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules["stack_status"] = module
spec.loader.exec_module(module)

spent = module.spent_branches(json.loads(sys.argv[2]))
print("not spent" if spent is None else " ".join(spent))
PY
}

@test "a stack whose every branch has merged is spent" {
    # What `just stack-sync` clears out, so the watch draws "no stack".
    run spent_of '{"branches": [
        {"name": "a", "isMerged": true}, {"name": "b", "isMerged": true}
    ]}'
    [ "$status" -eq 0 ]
    [ "$output" = "a b" ]
}

@test "a stack with one branch still open is not spent" {
    run spent_of '{"branches": [
        {"name": "a", "isMerged": true}, {"name": "b", "isMerged": false}
    ]}'
    [ "$status" -eq 0 ]
    [ "$output" = "not spent" ]
}

@test "no stack, or one with no branches, is not spent" {
    run spent_of 'null'
    [ "$output" = "not spent" ]
    run spent_of '{"branches": []}'
    [ "$output" = "not spent" ]
}

# Whether stack-status counts one check name in the heavy tier.
heavy() {
    python3 - "$SCRIPT" "$1" <<'PY'
import importlib.util, sys

spec = importlib.util.spec_from_file_location("stack_status", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules["stack_status"] = module
spec.loader.exec_module(module)

print(module.is_heavy(sys.argv[2]))
PY
}

@test "the SAST job is in the heavy tier under its new name" {
    # Renamed from "Semgrep (frontend SAST)" on 14 October 2026. A name
    # left out of the list is drawn in the fast column instead.
    run heavy "SAST"
    [ "$status" -eq 0 ]
    [ "$output" = "True" ]
}

@test "the SAST job's old name is no longer a check" {
    # Reported by a job of its own until the rules asking for "SAST" were
    # applied on 14 October 2026, and gone with it.
    run heavy "Semgrep (frontend SAST)"
    [ "$status" -eq 0 ]
    [ "$output" = "False" ]
}

# Prints the branches stack-rebase should still have moved, or "none".
left_behind_of() {
    python3 - "$SCRIPT" "$1" <<'PY'
import importlib.util, json, sys

spec = importlib.util.spec_from_file_location("stack_status", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules["stack_status"] = module
spec.loader.exec_module(module)

found = module.left_behind_branches(json.loads(sys.argv[2]))
print(" ".join(found) if found else "none")
PY
}

@test "a queued branch, and one sitting exactly on it, need no rebase" {
    # 26 October 2026: #2203 was queued, and stack-submit refused to push
    # the branch above it.
    run left_behind_of '{"branches": [
        {"name": "a", "head": "1", "isMerged": true},
        {"name": "b", "head": "2", "base": "1", "isQueued": true, "needsRebase": true},
        {"name": "c", "head": "3", "base": "2", "needsRebase": true}
    ]}'
    [ "$status" -eq 0 ]
    [ "$output" = "none" ]
}

@test "a branch the rebase skipped, with nothing queued, is reported" {
    run left_behind_of '{"branches": [
        {"name": "a", "head": "1", "base": "0"},
        {"name": "b", "head": "2", "base": "9", "needsRebase": true}
    ]}'
    [ "$output" = "b" ]
}

@test "a branch above a queued one but off its tip is still reported" {
    run left_behind_of '{"branches": [
        {"name": "a", "head": "1", "base": "0", "isQueued": true, "needsRebase": true},
        {"name": "b", "head": "2", "base": "8", "needsRebase": true}
    ]}'
    [ "$output" = "b" ]
}

@test "merged branches and a missing stack report nothing" {
    run left_behind_of '{"branches": [
        {"name": "a", "head": "1", "isMerged": true, "needsRebase": true}
    ]}'
    [ "$output" = "none" ]
    run left_behind_of 'null'
    [ "$output" = "none" ]
}

# Prints what stack-status adds after the check marks for one pull request,
# or "none" when it adds nothing.
conflict_of() {
    python3 - "$SCRIPT" "$1" <<'PY'
import importlib.util, json, sys

spec = importlib.util.spec_from_file_location("stack_status", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules["stack_status"] = module
spec.loader.exec_module(module)

mark = module.conflict_mark(json.loads(sys.argv[2]), module.Palette(False))
print(mark or "none")
PY
}

@test "a pull request GitHub cannot merge says conflict" {
    # #2337, 4 November 2026: both marks were ticks while GitHub showed
    # a merge conflict, because the marks report only the checks.
    run conflict_of '{"mergeable": "CONFLICTING"}'
    [ "$status" -eq 0 ]
    [ "$output" = "conflict" ]
}

@test "a pull request that merges cleanly adds nothing" {
    run conflict_of '{"mergeable": "MERGEABLE"}'
    [ "$status" -eq 0 ]
    [ "$output" = "none" ]
}

@test "a pull request GitHub has not worked out yet adds nothing" {
    # GitHub answers UNKNOWN until it has computed the answer; the next
    # redraw usually has it.
    run conflict_of '{"mergeable": "UNKNOWN"}'
    [ "$status" -eq 0 ]
    [ "$output" = "none" ]
}

@test "a pull request with no mergeable field adds nothing" {
    run conflict_of '{}'
    [ "$status" -eq 0 ]
    [ "$output" = "none" ]
}

@test "the pull request listing asks GitHub for mergeable" {
    run grep -F '"number,headRefName,isDraft,mergeable,state,"' "$SCRIPT"
    [ "$status" -eq 0 ]
}

# A throwaway repository with a parent commit and a branch on it that
# adds, changes, deletes and renames a file, so the expanded list has
# each kind to show. The repository is the current directory afterwards,
# and HOME is the test's own folder, so the diffs written under
# ~/.cache never reach the real one.
make_branch() {
    export HOME="${BATS_TEST_TMPDIR}/home"
    mkdir -p "$HOME"
    repo="${BATS_TEST_TMPDIR}/repo"
    mkdir -p "$repo"
    cd "$repo"
    git init -q -b main
    git config user.email test@example.com
    git config user.name Test
    printf 'one\ntwo\n' > changed.txt
    printf 'gone\n' > deleted.txt
    printf 'same\nlines\nhere\n' > "old name.txt"
    git add -A
    git commit -qm parent
    git switch -qc unit
    printf 'one\nthree\nfour\n' > changed.txt
    git rm -q deleted.txt
    git mv "old name.txt" "new name.txt"
    printf 'new\n' > added.txt
    git add -A
    git commit -qm unit
}

# Runs Python against stack-status.py, loaded as `module`, in the
# current repository: the code to run is the first argument.
with_module() {
    python3 - "$SCRIPT" "$1" <<'PY'
import importlib.util, sys

spec = importlib.util.spec_from_file_location("stack_status", sys.argv[1])
module = importlib.util.module_from_spec(spec)
# Registered first: its dataclasses look their own module up by name.
sys.modules["stack_status"] = module
spec.loader.exec_module(module)

exec(sys.argv[2])
PY
}

@test "an expanded branch lists each file it changes, with its letter and counts" {
    make_branch
    run with_module '
for f in module.changed_files("main", "unit"):
    print(f.status, f.path, f.added, f.removed, f.old_path)
'
    [ "$status" -eq 0 ]
    [[ "$output" == *"A added.txt 1 0 None"* ]]
    [[ "$output" == *"M changed.txt 2 1 None"* ]]
    [[ "$output" == *"D deleted.txt 0 1 None"* ]]
    # A rename is one line, kept whole although its names hold spaces.
    [[ "$output" == *"R new name.txt 0 0 old name.txt"* ]]
}

@test "an expanded branch is measured against its parent, not the trunk" {
    # A branch on top of the first changes one file. Its list is that
    # file only, not everything the branch below it changed.
    make_branch
    git switch -qc above
    printf 'above\n' > above.txt
    git add -A
    git commit -qm above
    run with_module '
for f in module.changed_files("unit", "above"):
    print(f.status, f.path)
'
    [ "$status" -eq 0 ]
    [ "$output" = "A above.txt" ]
}

@test "each changed file's diff is written to a short path in the home cache" {
    make_branch
    run with_module '
files = module.changed_files("main", "unit")
print(module.write_diffs("main", "unit", files)["changed.txt"])
'
    [ "$status" -eq 0 ]
    # Numbered for its place in the list, in a folder named for the
    # worktree, so the printed path stays short.
    [[ "$output" == "$HOME/.cache/stack-watch/repo/"[0-9]"-changed.txt.diff" ]]
    grep -qx '+three' "$output"
    grep -qx -- '-two' "$output"
}

@test "a file the branch no longer changes leaves no diff behind" {
    make_branch
    stale="$HOME/.cache/stack-watch/repo/9-stale.txt.diff"
    mkdir -p "$(dirname "$stale")"
    : > "$stale"
    run with_module '
module.write_diffs("main", "unit", module.changed_files("main", "unit"))
'
    [ "$status" -eq 0 ]
    [ ! -e "$stale" ]
}

@test "each line ends with its diff's path, plain, even with colour on" {
    # A hidden file:// link opens on the machine in front of you, which
    # over Remote SSH is not the one holding the diff. A plain path is
    # found by VS Code and opened where the terminal runs.
    make_branch
    run with_module '
files = module.changed_files("main", "unit")
diffs = module.write_diffs("main", "unit", files)
for line in module.expanded_lines(files, diffs, module.Palette(True)):
    print(line)
'
    [ "$status" -eq 0 ]
    [[ "$output" != *$'\033]8;'* ]]
    [[ "$output" == *"$HOME/.cache/stack-watch/repo/"[0-9]"-added.txt.diff"* ]]
}

@test "with no colour, the paths are plain text with no escape in them" {
    # Piped output, or --no-colour, must carry nothing a reader would
    # see as rubbish.
    make_branch
    run with_module '
files = module.changed_files("main", "unit")
diffs = module.write_diffs("main", "unit", files)
for line in module.expanded_lines(files, diffs, module.Palette(False)):
    print(line)
'
    [ "$status" -eq 0 ]
    [[ "$output" != *$'\033'* ]]
    [[ "$output" == *"M changed.txt   +2 -1   $HOME/.cache/stack-watch/repo/"* ]]
    [[ "$output" == *"R old name.txt → new name.txt   +0 -0   $HOME/"* ]]
}

@test "a branch with no changes says so" {
    make_branch
    git switch -qc empty
    run with_module '
files = module.changed_files("unit", "empty")
print(module.expanded_lines(files, {}, module.Palette(False))[0])
'
    [ "$status" -eq 0 ]
    [ "$output" = "no changes" ]
}

@test "the expanded lines are drawn under that branch only" {
    run with_module '
branches = [
    module.Branch(name=n, is_current=False, is_merged=False,
                  is_queued=False, needs_rebase=False)
    for n in ("top", "bottom")
]
module.draw(branches, "main", module.Palette(False), show_prs=False,
            expanded=("bottom", ["M file.txt   +1 -0"]))
'
    [ "$status" -eq 0 ]
    # "top", then "bottom", then the file line under it, and nothing
    # under "top". The spaces are taken out to compare, so the letter
    # and the name run together.
    # cspell:ignore Mfile
    order="$(printf '%s\n' "$output" | grep -E 'top|bottom|file' | tr -d ' │○')"
    [ "$order" = "$(printf 'top\nbottom\nMfile.txt+1-0')" ]
}

@test "the watch reads e, and passes --expand only once it is pressed" {
    justfile="${BATS_TEST_DIRNAME}/../../Justfile"
    run grep -F 'a|A|s|S|[1-9]|b|B|f|F|e|E)' "$justfile"
    [ "$status" -eq 0 ]
    run grep -F 'expand=(--expand "$(git branch --show-current)")' "$justfile"
    [ "$status" -eq 0 ]
}
