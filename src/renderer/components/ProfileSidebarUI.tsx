/** Six-dot drag affordance used by terminal pane headers. */
export function DragHandle() {
  return (
    <svg className="h-3 w-3 text-chrome-text-dim" viewBox="0 0 8 12" fill="currentColor" aria-hidden>
      <circle cx="2" cy="2" r="1" />
      <circle cx="6" cy="2" r="1" />
      <circle cx="2" cy="6" r="1" />
      <circle cx="6" cy="6" r="1" />
      <circle cx="2" cy="10" r="1" />
      <circle cx="6" cy="10" r="1" />
    </svg>
  );
}
