import * as React from "react";
import { cn } from "@/lib/utils";

export function ScrollArea({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("overflow-y-auto", className)} {...props} />;
}

// Kept as a no-op compatibility export for any local imports added later.
export function ScrollBar(): null {
  return null;
}
