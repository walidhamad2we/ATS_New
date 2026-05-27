import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline"
  children?: React.ReactNode
  className?: string
  severity?: string
  onClick?: () => void
}

function Badge({ className, variant = "default", severity, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variant === "default" && "border-transparent bg-slate-900 text-white shadow dark:bg-slate-50 dark:text-slate-900",
        variant === "secondary" && "border-transparent bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50",
        variant === "destructive" && "border-transparent bg-red-500 text-white shadow dark:bg-red-900 dark:text-slate-50",
        variant === "outline" && "text-slate-950 dark:text-slate-50 border-slate-200 dark:border-slate-800",
        className
      )}
      {...props}
    />
  )
}

export { Badge }
