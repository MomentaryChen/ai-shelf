import { useEffect } from "react";
import { ChatTab } from "./components/ChatTab";
import { SyncToastHost } from "./components/SyncToastHost";
import { useInventoryScan } from "./hooks/useInventoryScan";
import { useLocale } from "./i18n/LocaleProvider";

export function ChatWindowApp() {
  const { t } = useLocale();
  const { data, scanning, enriching } = useInventoryScan();

  useEffect(() => {
    document.documentElement.dataset.surfaceContext = "chrome";
    return () => {
      delete document.documentElement.dataset.surfaceContext;
    };
  }, []);

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-chrome-bg text-chrome-text"
      data-surface="chrome"
    >
      {(scanning || enriching) && (
        <div className="flex h-7 shrink-0 items-center border-b border-chrome-border px-3 text-[11px] text-chrome-text-secondary">
          {scanning && t("app.detectingShort")}
          {scanning && enriching && " · "}
          {enriching && t("app.loadingModels")}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatTab data={data} inventoryScanning={scanning} />
      </div>
      <SyncToastHost />
    </div>
  );
}
