import type { SyncModuleRow } from "./SyncResultsPanel";

function pluralise(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

export function getSyncSummary(modules: SyncModuleRow[]) {
  const imported = modules.filter((m) => m.outcome === "imported").length;
  const errors = modules.filter(
    (m) => m.outcome === "error" || m.outcome === "skipped",
  ).length;

  if (errors > 0 && imported > 0) {
    return {
      variant: "partial_success" as const,
      title: "Sync complete with errors",
      description: `${imported} imported, ${errors} ${pluralise(errors, "error", "errors")}`,
    };
  }

  if (errors > 0) {
    return {
      variant: "error" as const,
      title: "Sync failed",
      description: `${errors} ${pluralise(errors, "error", "errors")}`,
    };
  }

  return {
    variant: "success" as const,
    title: "Sync complete",
    description: `${imported} ${pluralise(imported, "module", "modules")} imported successfully`,
  };
}
