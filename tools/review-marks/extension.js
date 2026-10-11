// Review marks: show in the explorer, on tabs, in the status bar and beside
// the lines of a file which code has been stamped as read, and what has
// changed since.
//
// It keeps no record of its own. Every answer comes from
// `scripts/review-ledger.py states` in the folder that is open, which reads
// the one card in the shared local/ folder. So the editor and the `just r`
// recipes cannot disagree, and a window on a branch without the script
// simply shows no marks.
//
// Plain JavaScript with no build step and no packages of its own, so
// `install.sh` only has to zip two files.

const vscode = require("vscode");
const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.join("scripts", "review-ledger.py");
const READ = "read";
const CHANGED = "changed";
const UNREAD = "unread";

// Absolute path of a file or folder -> what is known about it.
let marks = new Map();
let watchers = [];
let timer;
let running = false;
let again = false;

// Bars inside a file: which lines are new or changed since it was
// stamped, and where lines were taken out. Light and dark each get a
// colour that shows against their own background.
const BAR_DARK = "#b4b4b4";
const BAR_LIGHT = "#1f1f1f";
let changedLineStyle;
let removedLineStyle;
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
function barPicture(colour) {
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
function linesToMark(diff) {
  const changed = [];
  const removedBefore = [];

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

const changedEmitter = new vscode.EventEmitter();
const log = vscode.window.createOutputChannel("Review marks");
let statusItem;

function run(command, args, cwd) {
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
function roots() {
  return (vscode.workspace.workspaceFolders || [])
    .map((folder) => folder.uri.fsPath)
    .filter((root) => fs.existsSync(path.join(root, SCRIPT)));
}

function rootOf(file) {
  return roots().find(
    (root) => file === root || file.startsWith(root + path.sep)
  );
}

/**
 * Turn the ledger's `states` output into marks, for files and folders.
 *
 * One line a file: state, lines, the date it was stamped, the fingerprint
 * it was stamped with, code or test, who read it, path, with tabs between.
 * A ledger from before stamps carried a name leaves the names out, and
 * its lines are one column shorter: the path is always the last.
 *
 * A folder gets a mark worked out from the files beneath it: changed if
 * any of them has changed, read if every one is read, and unread
 * otherwise.
 */
function marksFrom(output, root) {
  const found = new Map();
  // Folder -> how many files beneath it are in each state.
  const folders = new Map();

  for (const line of output.split("\n")) {
    if (!line) {
      continue;
    }

    const columns = line.split("\t");
    const [state, lines, stampedOn, fingerprint, kind] = columns;
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
      const tally = folders.get(dir) || { read: 0, changed: 0, unread: 0 };
      tally[state] += 1;
      folders.set(dir, tally);
      dir = path.dirname(dir);
    }
  }

  for (const [dir, tally] of folders) {
    let state = UNREAD;

    if (tally.changed > 0) {
      state = CHANGED;
    } else if (tally.unread === 0) {
      state = READ;
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

async function loadRoot(root, into) {
  const output = await run("python3", [SCRIPT, "states"], root);

  for (const [key, mark] of marksFrom(output, root)) {
    into.set(key, mark);
  }
}

async function refresh() {
  if (running) {
    again = true;
    return;
  }

  running = true;

  try {
    const next = new Map();

    for (const root of roots()) {
      await loadRoot(root, next);
    }

    const before = marks;
    marks = next;

    const touched = [];

    for (const key of new Set([...before.keys(), ...next.keys()])) {
      const was = before.get(key);
      const now = next.get(key);

      // Unread shows no mark, the same as a file that is not counted.
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
      refresh();
    }
  }
}

// "by Ada Reader" for a mark that names who read the file, or nothing.
function byWhom(mark) {
  return mark.readers ? ` by ${mark.readers}` : "";
}

function shown(mark) {
  return mark && mark.state !== UNREAD ? mark.state : undefined;
}

function refreshSoon() {
  clearTimeout(timer);
  timer = setTimeout(refresh, 400);
}

const decorations = {
  onDidChangeFileDecorations: changedEmitter.event,

  provideFileDecoration(uri) {
    const mark = marks.get(uri.fsPath);

    if (!mark) {
      return undefined;
    }

    if (mark.state === READ) {
      return {
        badge: "✓",
        color: new vscode.ThemeColor("charts.green"),
        tooltip: mark.folder
          ? "Every file in here is read"
          : `Read${byWhom(mark)} on ${mark.stampedOn}`,
      };
    }

    if (mark.state === CHANGED) {
      return {
        badge: "≠",
        color: new vscode.ThemeColor("charts.orange"),
        tooltip: mark.folder
          ? `${mark.tally.changed} changed since read, in here`
          : `Changed since it was read${byWhom(mark)} on ${mark.stampedOn}`,
      };
    }

    return undefined;
  },
};

function clearBars(editor) {
  editor.setDecorations(changedLineStyle, []);
  editor.setDecorations(removedLineStyle, []);
}

// Paint the bars for one editor, or clear them when its file is not one
// that has changed since it was read.
async function paintBars(editor, round) {
  const uri = editor.document.uri;
  const mark = uri.scheme === "file" ? marks.get(uri.fsPath) : undefined;
  const root = mark && rootOf(uri.fsPath);

  if (!mark || mark.folder || mark.state !== CHANGED || !root) {
    clearBars(editor);
    return;
  }

  let diff;

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

function paintAllBars() {
  paintRound += 1;

  for (const editor of vscode.window.visibleTextEditors) {
    paintBars(editor, paintRound);
  }
}

function activeFile() {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.uri.scheme !== "file") {
    return undefined;
  }

  return editor.document.uri.fsPath;
}

function updateStatus() {
  const file = activeFile();
  const mark = file && marks.get(file);

  if (!mark || mark.folder) {
    statusItem.hide();
    return;
  }

  statusItem.backgroundColor = undefined;

  if (mark.state === READ) {
    statusItem.text = "$(check) Read";
    statusItem.tooltip = `Read${byWhom(mark)} on ${mark.stampedOn}. Click for more.`;
  } else if (mark.state === CHANGED) {
    statusItem.text = "$(warning) Changed since read";
    statusItem.tooltip = `Read${byWhom(mark)} on ${mark.stampedOn}, and edited since. Click to see the change or stamp it.`;
    statusItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  } else {
    statusItem.text = "$(circle-large-outline) Unread";
    statusItem.tooltip = "Click to stamp this file as read.";
  }

  statusItem.show();
}

// The file or folder a command was asked about: the one clicked in the
// explorer or on a tab, or else the file in the editor.
function target(uri) {
  if (uri && uri.fsPath) {
    return uri.fsPath;
  }

  return activeFile();
}

async function ledger(command, file) {
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
    vscode.window.showWarningMessage(`Review marks: ${error.message}`);
    return false;
  }
}

async function saveFirst(file) {
  const open = vscode.workspace.textDocuments.find(
    (doc) => doc.uri.fsPath === file && doc.isDirty
  );

  if (open) {
    // The stamp is of the file on disk, so unsaved edits would be missed.
    await open.save();
  }
}

async function stamp(uri) {
  const file = target(uri);

  if (!file) {
    return;
  }

  await saveFirst(file);
  await ledger("mark", file);
}

async function removeStamp(uri) {
  const file = target(uri);

  if (file) {
    await ledger("unmark", file);
  }
}

async function showChange(uri) {
  const file = target(uri);
  const mark = file && marks.get(file);
  const root = file && rootOf(file);

  if (!mark || mark.folder || !root) {
    return;
  }

  if (mark.state !== CHANGED) {
    vscode.window.showInformationMessage(
      mark.state === READ
        ? "Nothing has changed since you read this file."
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
      `${path.basename(file)}: as read on ${mark.stampedOn} ↔ now`
    );
  } catch (error) {
    vscode.window.showWarningMessage(
      "Git no longer holds this file as it was when you read it. Read the whole file, then stamp it again."
    );
    log.appendLine(String(error));
  }
}

async function statusClick() {
  const file = activeFile();
  const mark = file && marks.get(file);

  if (!mark) {
    return;
  }

  if (mark.state === UNREAD) {
    await stamp();
    return;
  }

  const options =
    mark.state === CHANGED
      ? ["Show what changed", "Stamp as read", "Take the stamp off"]
      : ["Take the stamp off"];
  const choice = await vscode.window.showQuickPick(options, {
    placeHolder:
      mark.state === CHANGED
        ? `Read${byWhom(mark)} on ${mark.stampedOn}, and edited since`
        : `Read${byWhom(mark)} on ${mark.stampedOn}`,
  });

  if (choice === "Show what changed") {
    await showChange();
  } else if (choice === "Stamp as read") {
    await stamp();
  } else if (choice === "Take the stamp off") {
    await removeStamp();
  }
}

// The card is replaced, not edited, each time it is written, so watch the
// folder it sits in and not the file.
async function watchCards(context) {
  for (const watcher of watchers) {
    watcher.close();
  }

  watchers = [];

  for (const root of roots()) {
    try {
      const helper = path.join("scripts", "local-path.sh");
      const shared = (await run("bash", [helper], root)).trim();

      watchers.push(
        fs.watch(shared, (event, name) => {
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

function activate(context) {
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
      watchCards(context);
      refresh();
    }),
    vscode.window.onDidChangeWindowState((state) => {
      // A branch switch or a stamp from the terminal while away.
      if (state.focused) {
        refreshSoon();
      }
    })
  );

  watchCards(context);
  refresh();
}

function deactivate() {}

module.exports = { activate, deactivate, linesToMark, marksFrom };
