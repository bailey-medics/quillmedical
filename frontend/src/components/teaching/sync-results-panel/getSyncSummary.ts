import type { SyncModuleRow } from "./SyncResultsPanel";

function pluralise(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

export function getSyncSummary(modules: SyncModuleRow[]) {
  const imported = modules.filter((m) => m.outcome === "imported").length;
  const upToDate = modules.filter((m) => m.outcome === "up_to_date").length;
  const errors = modules.filter(
    (m) => m.outcome === "error" || m.outcome === "skipped",
  ).length;
  const ok = imported + upToDate;

  if (errors > 0 && ok > 0) {
    return {
      variant: "partial_success" as const,
      title: "Sync complete with errors",
      description: `${ok} imported, ${errors} ${pluralise(errors, "error", "errors")}`,
    };
  }

  if (errors > 0) {
    return {
      variant: "error" as const,
      title: "Sync failed",
      description: `${errors} ${pluralise(errors, "error", "errors")}`,
    };
  }

  if (imported === 0 && upToDate > 0) {
    return {
      variant: "success" as const,
      title: "Sync complete",
      description: `All ${pluralise(upToDate, "module is", "modules are")} up to date`,
    };
  }

  const parts: string[] = [];
  if (imported > 0) {
    parts.push(
      `${imported} ${pluralise(imported, "module", "modules")} imported`,
    );
  }
  if (upToDate > 0) {
    parts.push(`${upToDate} up to date`);
  }

  return {
    variant: "success" as const,
    title: "Sync complete",
    description: parts.join(", ") || "No modules found",
  };
}
