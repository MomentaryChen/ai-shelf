import { useEffect } from "react";
import { ChatTab } from "./components/ChatTab";
import { SyncToastHost } from "./components/SyncToastHost";
import { Spinner } from "./components/Spinner";
import { useInventoryScan } from "./hooks/useInventoryScan";
import { useLocale } from "./i18n/LocaleProvider";

export function ChatWindowApp() {
  const { t } = useLocale();
  const { data, scanning, error, hasData, ready } = useInventoryScan();
  const inventoryScanning = scanning;

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
      {scanning && !hasData && !error && (
        <div className="flex flex-1 items-center justify-center">
          <Spinner label={t("app.detecting")} />
        </div>
      )}
      {error && !hasData && (
        <p className="flex flex-1 items-center justify-center text-chrome-text-muted">
          {t("app.loadInventoryFailed")}
        </p>
      )}
      {ready && <ChatTab data={data} inventoryScanning={inventoryScanning} />}
      <SyncToastHost />
    </div>
  );
}
