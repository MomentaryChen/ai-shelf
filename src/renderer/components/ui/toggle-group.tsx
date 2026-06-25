import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const toggleGroupItemVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border text-[13px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:border-accent/60 data-[state=on]:bg-accent/10 data-[state=on]:font-medium data-[state=on]:text-accent data-[state=off]:border-border data-[state=off]:text-text-secondary data-[state=off]:hover:border-accent/40 data-[state=off]:hover:text-text-primary",
  {
    variants: {
      size: {
        default: "px-4 py-2",
        sm: "px-3.5 py-2",
        compact: "rounded-[5px] px-2.5 py-1 text-[12px] data-[state=on]:shadow-card",
        chrome: "rounded-[5px] px-2.5 py-0.5 text-[11px] data-[state=on]:bg-bg-card data-[state=on]:font-medium data-[state=on]:text-text-primary data-[state=on]:shadow-card",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleGroupItemVariants>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(toggleGroupItemVariants({ size }), className)}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem, toggleGroupItemVariants };
