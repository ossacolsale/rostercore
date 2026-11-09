import { lazy, Suspense, type ComponentProps } from "react";
import { useI18n } from "./i18n";
const Export = lazy(() =>
  import("./export-dialog").then((module) => ({
    default: module.ExportDialog,
  })),
);
export function ExportDialog(props: ComponentProps<typeof Export>) {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={<p role="status">{t("Preparing export preview...")}</p>}
    >
      <Export {...props} />
    </Suspense>
  );
}
