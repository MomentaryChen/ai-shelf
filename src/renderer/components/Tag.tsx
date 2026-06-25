import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Tag({
  children,
  title,
  className,
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn(
        "rounded-md px-2 py-0.5 text-xs font-normal text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-text-primary",
        className,
      )}
    >
      {children}
    </Badge>
  );
}
