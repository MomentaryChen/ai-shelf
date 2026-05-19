import { lazy, Suspense } from "react";
import { Spinner } from "./components/Spinner";
import { useInventoryScan } from "./hooks/useInventoryScan";

const ChatTab = lazy(() =>
  import("./components/ChatTab").then((m) => ({ default: m.ChatTab })),
);

export function ChatWindowApp() {
  const { data, scanning, error, hasData } = useInventoryScan();
  const inventoryScanning = scanning;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
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
        <Suspense fallback={<Spinner label="Loading terminal…" />}>
          <ChatTab data={data} inventoryScanning={inventoryScanning} />
        </Suspense>
      )}
    </div>
  );
}
