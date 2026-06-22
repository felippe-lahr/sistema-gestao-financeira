import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-[999px] border px-[11px] py-[4px] text-xs font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#EBF3FC] text-[#1a67c2]",
        secondary:
          "border-transparent bg-[#F3F3F5] text-[#52525C]",
        destructive:
          "border-transparent bg-[#FBECEC] text-[#c0392b]",
        outline:
          "border-[#ECECEF] text-[#3C3C44] bg-transparent",
        success:
          "border-transparent bg-[#EAF6EF] text-[#1a6b45]",
        warning:
          "border-transparent bg-[#FBF3E0] text-[#7a5c00]",
        // Aliases for financial status
        pago:
          "border-transparent bg-[#EAF6EF] text-[#1a6b45]",
        pendente:
          "border-transparent bg-[#FBF3E0] text-[#7a5c00]",
        vencido:
          "border-transparent bg-[#FBECEC] text-[#c0392b]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
