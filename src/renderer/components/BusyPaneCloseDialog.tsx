import { ConfirmDialog } from "./ConfirmDialog";
import { useLocale } from "../i18n/LocaleProvider";

export function BusyPaneCloseDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLocale();
  return (
    <ConfirmDialog
      open={open}
      title={t("pane.closeBusyTitle")}
      description={t("pane.closeBusyConfirm")}
      confirmLabel={t("pane.closeBusyAction")}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
