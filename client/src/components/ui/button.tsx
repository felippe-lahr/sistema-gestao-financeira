import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "rounded-[11px] bg-[#1a67c2] text-white py-[10px] px-[17px] hover:brightness-[0.93]",
        destructive:
          "rounded-[11px] bg-transparent border border-[#E4E4E8] dark:border-[#2C2C3C] text-[#3C3C44] dark:text-[#C4C4D0] hover:bg-[#FBECEC] dark:hover:bg-[#2B0D0D] hover:text-[#c0392b] focus-visible:ring-destructive/20",
        outline:
          "rounded-[11px] bg-white dark:bg-[#252532] border border-[#E4E4E8] dark:border-[#2C2C3C] text-[#3C3C44] dark:text-[#C4C4D0] py-[10px] px-[15px] hover:bg-[#F6F6F8] dark:hover:bg-[#2E2E3E] hover:border-[#D6D6DC] dark:hover:border-[#3C3C50]",
        secondary:
          "rounded-[11px] bg-[#F3F3F5] dark:bg-[#252532] text-[#3C3C44] dark:text-[#C4C4D0] py-[10px] px-[15px] hover:bg-[#ECECEF] dark:hover:bg-[#2E2E3E]",
        ghost:
          "rounded-[11px] py-[10px] px-[15px] hover:bg-[#F1F1F4] dark:hover:bg-[#252532] hover:text-[#3C3C44] dark:hover:text-[#C4C4D0]",
        link: "text-[#1a67c2] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-[9px] gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-[11px] px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-[11px]",
        "icon-sm": "size-8 rounded-[9px]",
        "icon-lg": "size-10 rounded-[11px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
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
