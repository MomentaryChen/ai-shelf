export function DataTable({
  headers,
  children,
}: {
  headers: React.ReactNode[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-secondary whitespace-nowrap"
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
