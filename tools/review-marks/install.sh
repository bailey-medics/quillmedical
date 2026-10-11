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
# repository. Needs `node` to read the version, `zip`, and VS Code's
# `code` command.
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
    <Description xml:space="preserve">Shows which files have been stamped as read.</Description>
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

  local version=""
  version="$(node -p "require('${here}/package.json').version")"

  local build=""
  build="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${build}'" EXIT

  mkdir "${build}/extension"
  cp "${here}/package.json" "${here}/extension.js" "${build}/extension/"
  write_manifests "$build" "$version"

  (cd "$build" && zip -q -r review-marks.vsix "[Content_Types].xml" extension.vsixmanifest extension)

  "$code" --install-extension "${build}/review-marks.vsix" --force
  echo "Installed review-marks ${version}. Run 'Developer: Reload Window' in each VS Code window."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
