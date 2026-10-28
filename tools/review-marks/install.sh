#!/usr/bin/env bash
# Packages this folder as a VS Code extension and installs it.
#
# Usage: install.sh
#
# Run through `just review-marks-install`. After it, run "Developer:
# Reload Window" in each VS Code window that is open.
#
# The extension is two files, so the package is built here by hand: a
# .vsix is a zip holding the files and two small manifests. It is built
# in a scratch folder and removed afterwards, so nothing is left in the
# repository. The source is TypeScript, and the JavaScript VS Code loads
# is made in that scratch folder by Node's own `stripTypeScriptTypes`,
# so no compiler is needed. Needs Node 22.13 or later, `zip`, and VS
# Code's `code` command.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prints the path of VS Code's command line tool, or nothing.
find_code() {
  local mac_app="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"

  if command -v code >/dev/null 2>&1; then
    command -v code
  elif [ -x "$mac_app" ]; then
    echo "$mac_app"
  fi
}

# Succeeds when `zip`, which packs the extension, is installed. Otherwise
# says how to install it, picking the line for this machine's package
# manager where it can tell, and fails.
require_zip() {
  if command -v zip >/dev/null 2>&1; then
    return 0
  fi

  local apt_line="  Ubuntu or Debian:  sudo apt install zip"
  local dnf_line="  Fedora:            sudo dnf install zip"
  local brew_line="  macOS:             brew install zip   (macOS normally has it already)"

  echo "The 'zip' command was not found. It packs the extension. Install it, then run this again:" >&2

  if command -v apt >/dev/null 2>&1; then
    echo "$apt_line" >&2
  elif command -v dnf >/dev/null 2>&1; then
    echo "$dnf_line" >&2
  else
    printf '%s\n' "$apt_line" "$dnf_line" "$brew_line" >&2
  fi

  return 1
}

# Writes `extension.js` into the given folder: `extension.ts` less its
# types. Fails, saying so, on a Node too old to strip them.
compile_extension() {
  local out="$1"

  node --no-warnings -e '
const fs = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
if (typeof stripTypeScriptTypes !== "function") {
  console.error("Node " + process.version + " cannot strip TypeScript types: Node 22.13 or later is needed");
  process.exit(1);
}
fs.writeFileSync(process.argv[2], stripTypeScriptTypes(fs.readFileSync(process.argv[1], "utf8")));
' "${here}/extension.ts" "${out}/extension.js"
}

# Writes the two manifests a .vsix needs beside the extension's files.
write_manifests() {
  local build="$1"
  local version="$2"

  cat > "${build}/[Content_Types].xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>
XML

  cat > "${build}/extension.vsixmanifest" <<XML
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="review-marks" Version="${version}" Publisher="local"/>
    <DisplayName>Review marks</DisplayName>
    <Description xml:space="preserve">Shows which files have been audited.</Description>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.80.0"/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/>
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>
XML
}

main() {
  local code=""
  code="$(find_code)"

  if [ -z "$code" ]; then
    echo "VS Code's 'code' command was not found. In VS Code, run 'Shell Command: Install code command in PATH', then run this again." >&2
    exit 1
  fi

  require_zip || exit 1

  local version=""
  version="$(node -p "require('${here}/package.json').version")"

  local build=""
  build="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${build}'" EXIT

  mkdir "${build}/extension"
  cp "${here}/package.json" "${build}/extension/"
  compile_extension "${build}/extension"
  write_manifests "$build" "$version"

  (cd "$build" && zip -q -r review-marks.vsix "[Content_Types].xml" extension.vsixmanifest extension)

  "$code" --install-extension "${build}/review-marks.vsix" --force
  echo "Installed review-marks ${version}. Run 'Developer: Reload Window' in each VS Code window."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
