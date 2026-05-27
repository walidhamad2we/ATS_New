import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    return (
      <button
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
          // Variant classes
          variant === "default" && "bg-slate-900 text-white hover:bg-slate-900/90 shadow dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-50/90",
          variant === "destructive" && "bg-red-500 text-white hover:bg-red-500/90 shadow-sm",
          variant === "outline" && "border border-slate-200 bg-white hover:bg-slate-100/80 text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-800 dark:text-slate-50",
          variant === "secondary" && "bg-slate-100 text-slate-900 hover:bg-slate-100/80 shadow-sm dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-800/80",
          variant === "ghost" && "hover:bg-slate-100/80 text-slate-700 hover:text-slate-900 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-50",
          variant === "link" && "text-slate-900 underline-offset-4 hover:underline dark:text-slate-50",
          // Size classes
          size === "default" && "h-9 px-4 py-2",
          size === "sm" && "h-8 rounded-md px-3 text-xs",
          size === "lg" && "h-10 rounded-md px-8",
          size === "icon" && "h-9 w-9",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
