// Review marks: show in the explorer, on tabs, in the status bar and beside
// the lines of a file which code has been stamped as audited, and what has
// changed since.
//
// It keeps no record of its own. Every answer comes from
// `scripts/review-ledger.py states` in the folder that is open, which reads
// the one card in the shared local/ folder. So the editor and the `just r`
// recipes cannot disagree, and a window on a branch without the script
// simply shows no marks.
//
// TypeScript, with no packages of its own. `install.sh` strips the types
// with Node's own `stripTypeScriptTypes`, so the file VS Code loads is
// this one less its types, and nothing needs compiling beyond that. The
// source therefore uses only syntax that erasing the types leaves as
// working JavaScript (`erasableSyntaxOnly` in tsconfig.json), and stays
// CommonJS, which every VS Code still loads: the modules are reached with
// `require`, and typed through `import type`.

import type * as VsCode from "vscode";
import type * as ChildProcess from "node:child_process";
import type * as Fs from "node:fs";
import type * as Os from "node:os";
import type * as Path from "node:path";

const vscode: typeof VsCode = require("vscode");
const cp: typeof ChildProcess = require("child_process");
const fs: typeof Fs = require("fs");
const os: typeof Os = require("os");
const path: typeof Path = require("path");

type State = "audited" | "changed" | "unaudited";

/** What is known about one file, from the ledger. */
interface FileMark {
  state: State;
  lines: number;
  stampedOn: string;
  fingerprint: string;
  kind: string;
  readers: string;
  relative: string;
  folder: false;
}

/** How many files beneath a folder are in each state. */
type Tally = Record<State, number>;

/** What is known about one folder, worked out from the files beneath it. */
interface FolderMark {
  state: State;
  folder: true;
  tally: Tally;
  relative: string;
}

type Mark = FileMark | FolderMark;

/** Lines to mark in a file: spans new or changed, and where lines went. */
interface LinesToMark {
  changed: { first: number; last: number }[];
  removedBefore: number[];
}

const SCRIPT = path.join("scripts", "review-ledger.py");
const AUDITED: State = "audited";
const CHANGED: State = "changed";
const UNAUDITED: State = "unaudited";

// Absolute path of a file or folder -> what is known about it.
let marks = new Map<string, Mark>();
let watchers: Fs.FSWatcher[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;

// Bars inside a file: which lines are new or changed since it was
// stamped, and where lines were taken out. Light and dark each get a
// colour that shows against their own background.
const BAR_DARK = "#b4b4b4";
const BAR_LIGHT = "#1f1f1f";
let changedLineStyle: VsCode.TextEditorDecorationType;
let removedLineStyle: VsCode.TextEditorDecorationType;
// Counts editors asked about, so a slow answer for a file the editor has
// since left does not paint over a newer one.
let paintRound = 0;

/**
 * A picture of one upright bar, for the margin beside a line.
 *
 * Made here and handed over as a data address, so the extension has no
 * picture files to carry. The bar is a third of the cell wide and sits in
 * its middle; `preserveAspectRatio="none"` lets it stretch to the full
 * height of a line whatever the font size.
 */
function barPicture(colour: string): VsCode.Uri {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" ' +
    'preserveAspectRatio="none">' +
    `<rect x="4" y="0" width="4" height="12" fill="${colour}"/></svg>`;

  return vscode.Uri.parse(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  );
}

/**
 * Read `git diff -U0` output and say what to mark in the new file.
 *
 * Each hunk header reads `@@ -a,b +c,d @@`: d lines starting at line c
 * are new or changed. When d is 0 nothing was added, so lines were only
 * taken out, after line c.
 *
 * Line numbers come back counted from 0, as the editor counts them.
 */
function linesToMark(diff: string): LinesToMark {
  const changed: LinesToMark["changed"] = [];
  const removedBefore: number[] = [];

  for (const line of diff.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);

    if (!hunk) {
      continue;
    }

    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);

    if (count === 0) {
      // Removed after line `start`, which is line `start` counted from 0.
      removedBefore.push(start);
      continue;
    }

    changed.push({ first: start - 1, last: start - 1 + count - 1 });
  }

  return { changed, removedBefore };
}

const changedEmitter = new vscode.EventEmitter<VsCode.Uri[]>();
const log = vscode.window.createOutputChannel("Review marks");
let statusItem: VsCode.StatusBarItem;

function run(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.execFile(
      command,
      args,
      { cwd, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || stdout || error.message).trim()));
          return;
        }

        resolve(stdout);
      }
    );
  });
}

// The folders open in this window that have the ledger script.
function roots(): string[] {
  return (vscode.workspace.workspaceFolders || [])
    .map((folder) => folder.uri.fsPath)
    .filter((root) => fs.existsSync(path.join(root, SCRIPT)));
}

function rootOf(file: string): string | undefined {
  return roots().find(
    (root) => file === root || file.startsWith(root + path.sep)
  );
}

/**
 * Turn the ledger's `states` output into marks, for files and folders.
 *
 * One line a file: state, lines, the date it was stamped, the fingerprint
 * it was stamped with, code or test, who audited it, path, with tabs between.
 * A ledger from before stamps carried a name leaves the names out, and
 * its lines are one column shorter: the path is always the last.
 *
 * A folder gets a mark worked out from the files beneath it: changed if
 * any of them has changed, audited if every one is audited, and unaudited
 * otherwise.
 */
function marksFrom(output: string, root: string): Map<string, Mark> {
  const found = new Map<string, Mark>();
  // Folder -> how many files beneath it are in each state.
  const folders = new Map<string, Tally>();

  for (const line of output.split("\n")) {
    if (!line) {
      continue;
    }

    const columns = line.split("\t");
    const [stateColumn, lines, stampedOn, fingerprint, kind] = columns;
    const state = stateColumn as State;
    const readers = columns.length >= 7 ? columns[5] : "";
    const relative = columns[columns.length - 1];
    const full = path.join(root, relative);

    found.set(full, {
      state,
      lines: Number(lines),
      stampedOn,
      fingerprint,
      kind,
      readers,
      relative,
      folder: false,
    });

    let dir = path.dirname(full);

    while (dir.startsWith(root + path.sep)) {
      const tally: Tally = folders.get(dir) || {
        audited: 0,
        changed: 0,
        unaudited: 0,
      };
      tally[state] += 1;
      folders.set(dir, tally);
      dir = path.dirname(dir);
    }
  }

  for (const [dir, tally] of folders) {
    let state: State = UNAUDITED;

    if (tally.changed > 0) {
      state = CHANGED;
    } else if (tally.unaudited === 0) {
      state = AUDITED;
    }

    found.set(dir, {
      state,
      folder: true,
      tally,
      relative: path.relative(root, dir),
    });
  }

  return found;
}

async function loadRoot(root: string, into: Map<string, Mark>): Promise<void> {
  const output = await run("python3", [SCRIPT, "states"], root);

  for (const [key, mark] of marksFrom(output, root)) {
    into.set(key, mark);
  }
}

async function refresh(): Promise<void> {
  if (running) {
    again = true;
    return;
  }

  running = true;

  try {
    const next = new Map<string, Mark>();

    for (const root of roots()) {
      await loadRoot(root, next);
    }

    const before = marks;
    marks = next;

    const touched: VsCode.Uri[] = [];

    for (const key of new Set([...before.keys(), ...next.keys()])) {
      const was = before.get(key);
      const now = next.get(key);

      // Unaudited shows no mark, the same as a file that is not counted.
      if (shown(was) !== shown(now)) {
        touched.push(vscode.Uri.file(key));
      }
    }

    if (touched.length > 0) {
      changedEmitter.fire(touched);
    }
  } catch (error) {
    log.appendLine(String(error));
  } finally {
    running = false;
    updateStatus();
    paintAllBars();

    if (again) {
      again = false;
      void refresh();
    }
  }
}

// "by Ada Reader" for a mark that names who audited the file, or nothing.
function byWhom(mark: Mark): string {
  return !mark.folder && mark.readers ? ` by ${mark.readers}` : "";
}

function shown(mark: Mark | undefined): State | undefined {
  return mark && mark.state !== UNAUDITED ? mark.state : undefined;
}

function refreshSoon(): void {
  clearTimeout(timer);
  timer = setTimeout(() => void refresh(), 400);
}

const decorations: VsCode.FileDecorationProvider = {
  onDidChangeFileDecorations: changedEmitter.event,

  provideFileDecoration(uri: VsCode.Uri): VsCode.FileDecoration | undefined {
    const mark = marks.get(uri.fsPath);

    if (!mark) {
      return undefined;
    }

    if (mark.state === AUDITED) {
      return {
        badge: "✓",
        color: new vscode.ThemeColor("charts.green"),
        tooltip: mark.folder
          ? "Every file in here is audited"
          : `Audited${byWhom(mark)} on ${mark.stampedOn}`,
      };
    }

    if (mark.state === CHANGED) {
      return {
        badge: "≠",
        color: new vscode.ThemeColor("charts.orange"),
        tooltip: mark.folder
          ? `${mark.tally.changed} changed since audit, in here`
          : `Changed since it was audited${byWhom(mark)} on ${mark.stampedOn}`,
      };
    }

    return undefined;
  },
};

function clearBars(editor: VsCode.TextEditor): void {
  editor.setDecorations(changedLineStyle, []);
  editor.setDecorations(removedLineStyle, []);
}

// Paint the bars for one editor, or clear them when its file is not one
// that has changed since it was audited.
async function paintBars(
  editor: VsCode.TextEditor,
  round: number
): Promise<void> {
  const uri = editor.document.uri;
  const mark = uri.scheme === "file" ? marks.get(uri.fsPath) : undefined;
  const root = mark && rootOf(uri.fsPath);

  if (!mark || mark.folder || mark.state !== CHANGED || !root) {
    clearBars(editor);
    return;
  }

  let diff: string;

  try {
    // The file as it was stamped, against the file on disk now.
    diff = await run(
      "git",
      ["diff", "-U0", "--no-color", mark.fingerprint, "--", mark.relative],
      root
    );
  } catch (error) {
    // Git no longer holds the stamped version, so there is nothing to
    // compare with. The status bar already says the file has changed.
    log.appendLine(String(error));
    clearBars(editor);
    return;
  }

  if (round !== paintRound) {
    return;
  }

  const last = editor.document.lineCount - 1;
  const found = linesToMark(diff);

  editor.setDecorations(
    changedLineStyle,
    found.changed.map(
      (span) =>
        new vscode.Range(
          Math.min(span.first, last),
          0,
          Math.min(span.last, last),
          0
        )
    )
  );
  editor.setDecorations(
    removedLineStyle,
    found.removedBefore.map((line) => {
      const at = Math.min(line, last);

      return new vscode.Range(at, 0, at, 0);
    })
  );
}

function paintAllBars(): void {
  paintRound += 1;

  for (const editor of vscode.window.visibleTextEditors) {
    void paintBars(editor, paintRound);
  }
}

function activeFile(): string | undefined {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.uri.scheme !== "file") {
    return undefined;
  }

  return editor.document.uri.fsPath;
}

function updateStatus(): void {
  const file = activeFile();
  const mark = file && marks.get(file);

  if (!mark || mark.folder) {
    statusItem.hide();
    return;
  }

  statusItem.backgroundColor = undefined;

  if (mark.state === AUDITED) {
    statusItem.text = "$(check) Audited";
    statusItem.tooltip = `Audited${byWhom(mark)} on ${mark.stampedOn}. Click for more.`;
  } else if (mark.state === CHANGED) {
    statusItem.text = "$(warning) Changed since audit";
    statusItem.tooltip = `Audited${byWhom(mark)} on ${mark.stampedOn}, and edited since. Click to see the change or stamp it.`;
    statusItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  } else {
    statusItem.text = "$(circle-large-outline) Not audited";
    statusItem.tooltip = "Click to stamp this file as audited.";
  }

  statusItem.show();
}

// The file or folder a command was asked about: the one clicked in the
// explorer or on a tab, or else the file in the editor.
function target(uri?: VsCode.Uri): string | undefined {
  if (uri && uri.fsPath) {
    return uri.fsPath;
  }

  return activeFile();
}

async function ledger(command: string, file: string | undefined): Promise<boolean> {
  const root = file && rootOf(file);

  if (!root) {
    vscode.window.showWarningMessage(
      "Review marks: this folder has no scripts/review-ledger.py."
    );
    return false;
  }

  try {
    const out = await run("python3", [SCRIPT, command, file], root);
    const first = out.split("\n")[0];

    vscode.window.setStatusBarMessage(first, 4000);
    await refresh();

    return true;
  } catch (error) {
    vscode.window.showWarningMessage(
      `Review marks: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

async function saveFirst(file: string): Promise<void> {
  const open = vscode.workspace.textDocuments.find(
    (doc) => doc.uri.fsPath === file && doc.isDirty
  );

  if (open) {
    // The stamp is of the file on disk, so unsaved edits would be missed.
    await open.save();
  }
}

async function stamp(uri?: VsCode.Uri): Promise<void> {
  const file = target(uri);

  if (!file) {
    return;
  }

  await saveFirst(file);
  await ledger("mark", file);
}

async function removeStamp(uri?: VsCode.Uri): Promise<void> {
  const file = target(uri);

  if (file) {
    await ledger("unmark", file);
  }
}

async function showChange(uri?: VsCode.Uri): Promise<void> {
  const file = target(uri);
  const mark = file && marks.get(file);
  const root = file && rootOf(file);

  if (!mark || mark.folder || !root) {
    return;
  }

  if (mark.state !== CHANGED) {
    vscode.window.showInformationMessage(
      mark.state === AUDITED
        ? "Nothing has changed since this file was audited."
        : "This file has not been stamped, so there is nothing to compare."
    );
    return;
  }

  try {
    const then = await run("git", ["cat-file", "-p", mark.fingerprint], root);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-marks-"));
    const old = path.join(dir, path.basename(file));

    fs.writeFileSync(old, then);

    await vscode.commands.executeCommand(
      "vscode.diff",
      vscode.Uri.file(old),
      vscode.Uri.file(file),
      `${path.basename(file)}: as audited on ${mark.stampedOn} ↔ now`
    );
  } catch (error) {
    vscode.window.showWarningMessage(
      "Git no longer holds this file as it was when it was audited. Audit the whole file, then stamp it again."
    );
    log.appendLine(String(error));
  }
}

async function statusClick(): Promise<void> {
  const file = activeFile();
  const mark = file && marks.get(file);

  // The open file's own mark; a folder never has an editor of its own.
  if (!mark || mark.folder) {
    return;
  }

  if (mark.state === UNAUDITED) {
    await stamp();
    return;
  }

  const options =
    mark.state === CHANGED
      ? ["Show what changed", "Stamp as audited", "Take the stamp off"]
      : ["Take the stamp off"];
  const choice = await vscode.window.showQuickPick(options, {
    placeHolder:
      mark.state === CHANGED
        ? `Audited${byWhom(mark)} on ${mark.stampedOn}, and edited since`
        : `Audited${byWhom(mark)} on ${mark.stampedOn}`,
  });

  if (choice === "Show what changed") {
    await showChange();
  } else if (choice === "Stamp as audited") {
    await stamp();
  } else if (choice === "Take the stamp off") {
    await removeStamp();
  }
}

// The card is replaced, not edited, each time it is written, so watch the
// folder it sits in and not the file.
async function watchCards(context: VsCode.ExtensionContext): Promise<void> {
  for (const watcher of watchers) {
    watcher.close();
  }

  watchers = [];

  for (const root of roots()) {
    try {
      const helper = path.join("scripts", "local-path.sh");
      const shared = (await run("bash", [helper], root)).trim();

      watchers.push(
        fs.watch(shared, (_event, name) => {
          if (name === "review-ledger.tsv") {
            refreshSoon();
          }
        })
      );
    } catch (error) {
      log.appendLine(String(error));
    }
  }

  context.subscriptions.push({
    dispose: () => watchers.forEach((watcher) => watcher.close()),
  });
}

function activate(context: VsCode.ExtensionContext): void {
  statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50
  );
  statusItem.command = "reviewMarks.statusClick";

  // A bar beside each line that is new or changed, with a mark in the
  // scrollbar so the changes can be found in a long file.
  //
  // The bar is drawn in the margin to the left of the line numbers, and
  // not as a border on the line: a border sits on top of the first
  // characters and makes them hard to read. The picture fills its cell
  // from top to bottom, so the bars on neighbouring lines join into one.
  changedLineStyle = vscode.window.createTextEditorDecorationType({
    overviewRulerLane: vscode.OverviewRulerLane.Left,
    dark: {
      gutterIconPath: barPicture(BAR_DARK),
      gutterIconSize: "100% 100%",
      overviewRulerColor: BAR_DARK,
    },
    light: {
      gutterIconPath: barPicture(BAR_LIGHT),
      gutterIconSize: "100% 100%",
      overviewRulerColor: BAR_LIGHT,
    },
  });
  // A dashed line above the line that now follows where lines were
  // taken out: nothing is left there to put a bar beside.
  removedLineStyle = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderStyle: "dashed",
    borderWidth: "1px 0 0 0",
    overviewRulerLane: vscode.OverviewRulerLane.Left,
    dark: { borderColor: BAR_DARK, overviewRulerColor: BAR_DARK },
    light: { borderColor: BAR_LIGHT, overviewRulerColor: BAR_LIGHT },
  });

  context.subscriptions.push(
    statusItem,
    log,
    vscode.window.registerFileDecorationProvider(decorations),
    vscode.commands.registerCommand("reviewMarks.stamp", stamp),
    vscode.commands.registerCommand("reviewMarks.removeStamp", removeStamp),
    vscode.commands.registerCommand("reviewMarks.showChange", showChange),
    vscode.commands.registerCommand("reviewMarks.statusClick", statusClick),
    vscode.commands.registerCommand("reviewMarks.refresh", refresh),
    changedLineStyle,
    removedLineStyle,
    vscode.window.onDidChangeActiveTextEditor(updateStatus),
    vscode.window.onDidChangeVisibleTextEditors(paintAllBars),
    vscode.workspace.onDidSaveTextDocument(refreshSoon),
    vscode.workspace.onDidCreateFiles(refreshSoon),
    vscode.workspace.onDidDeleteFiles(refreshSoon),
    vscode.workspace.onDidRenameFiles(refreshSoon),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void watchCards(context);
      void refresh();
    }),
    vscode.window.onDidChangeWindowState((state) => {
      // A branch switch or a stamp from the terminal while away.
      if (state.focused) {
        refreshSoon();
      }
    })
  );

  void watchCards(context);
  void refresh();
}

function deactivate(): void {}

module.exports = { activate, deactivate, linesToMark, marksFrom };
