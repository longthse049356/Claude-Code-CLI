import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {}

export function ScrollArea({ className, ...props }: ScrollAreaProps) {
  return <div className={cn("overflow-y-auto", className)} {...props} />;
}
