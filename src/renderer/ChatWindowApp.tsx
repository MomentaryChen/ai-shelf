import { ChatTab } from "./components/ChatTab";
import { AppBrand } from "./components/AppBrand";
import { Spinner } from "./components/Spinner";
import { useInventoryScan } from "./hooks/useInventoryScan";

export function ChatWindowApp() {
  const { data, scanning, error, hasData } = useInventoryScan();
  const inventoryScanning = scanning;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      <header className="flex h-8 shrink-0 items-center border-b border-border px-3">
        <AppBrand />
      </header>
      {scanning && !hasData && !error && (
        <div className="flex flex-1 items-center justify-center">
          <Spinner label="Detecting AI tools…" />
        </div>
      )}
      {error && !hasData && (
        <p className="flex flex-1 items-center justify-center text-text-secondary">
          Failed to load inventory data
        </p>
      )}
      {hasData && (
        <ChatTab data={data} inventoryScanning={inventoryScanning} />
      )}
    </div>
  );
}
