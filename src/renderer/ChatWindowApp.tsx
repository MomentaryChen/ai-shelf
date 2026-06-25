import { ChatTab } from "./components/ChatTab";
import { Spinner } from "./components/Spinner";
import { useInventoryScan } from "./hooks/useInventoryScan";
import { useLocale } from "./i18n/LocaleProvider";

export function ChatWindowApp() {
  const { t } = useLocale();
  const { data, scanning, error, hasData, ready } = useInventoryScan();
  const inventoryScanning = scanning;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      {scanning && !hasData && !error && (
        <div className="flex flex-1 items-center justify-center">
          <Spinner label={t("app.detecting")} />
        </div>
      )}
      {error && !hasData && (
        <p className="flex flex-1 items-center justify-center text-text-secondary">
          {t("app.loadInventoryFailed")}
        </p>
      )}
      {ready && <ChatTab data={data} inventoryScanning={inventoryScanning} />}
    </div>
  );
}
