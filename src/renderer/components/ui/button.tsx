import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap text-[15px] font-medium transition-all duration-200 outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 active:scale-90 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "rounded-[22px] border-0 text-on-accent warm-clay-gradient warm-shadow-accent hover:brightness-95 focus-visible:shadow-[0_0_0_2px_var(--color-accent-soft),0_4px_16px_-6px_var(--color-accent-soft)]",
        destructive: "rounded-[22px] bg-destructive text-destructive-foreground warm-shadow-card hover:bg-destructive/90",
        outline:
          "rounded-[22px] border border-input bg-transparent text-foreground hover:bg-accent-surface hover:text-accent-surface-foreground",
        secondary: "rounded-[22px] bg-secondary text-secondary-foreground hover:bg-sand-deep",
        ghost: "rounded-[22px] text-foreground hover:bg-accent-surface hover:text-accent-surface-foreground",
        chromeOutline:
          "rounded-[22px] border border-chrome-border-strong bg-chrome-surface text-[13px] text-chrome-text-secondary hover:border-chrome-border-hover hover:bg-chrome-hover hover:text-chrome-text focus-visible:shadow-[0_0_0_2px_rgb(201_123_90/0.35),0_4px_16px_-6px_rgb(201_123_90/0.25)]",
        chromeSolid:
          "rounded-[22px] border-0 warm-clay-gradient text-on-accent warm-shadow-accent hover:brightness-95 active:scale-95 focus-visible:shadow-[0_0_0_2px_var(--color-accent-soft),0_4px_16px_-6px_var(--color-accent-soft)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-10 px-4 py-2 has-[>svg]:px-3",
        sm: "min-h-9 gap-1.5 rounded-[22px] px-3 has-[>svg]:px-2.5",
        lg: "min-h-11 rounded-[22px] px-6 has-[>svg]:px-4",
        icon: "size-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
