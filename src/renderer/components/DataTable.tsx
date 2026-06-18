export function DataTable({
  headers,
  children,
}: {
  headers: React.ReactNode[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px] tabular-nums [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-bg-card/50">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="sticky top-0 z-10 border-b border-border bg-bg-secondary px-3 py-2.5 text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-text-tertiary whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-border/40 px-3 py-2.5 align-middle last:border-b-0 ${className}`}>
      {children}
    </td>
  );
}
