import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

const AccordionContext = React.createContext<{
  activeItem?: string
  setActiveItem?: (id: string) => void
} | null>(null)

export function Accordion({
  children,
  className,
  type = "single",
  collapsible = true,
  ...props
}: {
  children: React.ReactNode
  className?: string
  type?: "single"
  collapsible?: boolean
}) {
  const [activeItem, setActiveItem] = React.useState<string>("")

  const handleSetItem = (id: string) => {
    if (activeItem === id && collapsible) {
      setActiveItem("")
    } else {
      setActiveItem(id)
    }
  }

  return (
    <AccordionContext.Provider value={{ activeItem, setActiveItem: handleSetItem }}>
      <div className={cn("space-y-1", className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  )
}

export function AccordionItem({
  children,
  value,
  className,
  ...props
}: {
  children: React.ReactNode
  value: string
  className?: string
}) {
  return (
    <div className={cn("border-b border-slate-200 dark:border-slate-800", className)} data-value={value} {...props}>
      {children}
    </div>
  )
}

export function AccordionTrigger({
  children,
  className,
  ...props
}: {
  children: React.ReactNode
  className?: string
}) {
  const context = React.useContext(AccordionContext)
  const [value, setValue] = React.useState<string>("")
  const ref = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (ref.current) {
      const parent = ref.current.closest("[data-value]")
      if (parent) {
        setValue(parent.getAttribute("data-value") || "")
      }
    }
  }, [])

  const isOpen = context?.activeItem === value

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => context?.setActiveItem?.(value)}
      className={cn(
        "flex w-full items-center justify-between py-4 text-sm font-medium transition-all hover:underline text-right cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
    </button>
  )
}

export function AccordionContent({
  children,
  className,
  ...props
}: {
  children: React.ReactNode
  className?: string
}) {
  const context = React.useContext(AccordionContext)
  const [value, setValue] = React.useState<string>("")
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (ref.current) {
      const parent = ref.current.closest("[data-value]")
      if (parent) {
        setValue(parent.getAttribute("data-value") || "")
      }
    }
  }, [])

  const isOpen = context?.activeItem === value

  if (!isOpen) return null

  return (
    <div
      ref={ref}
      className={cn("overflow-hidden text-sm transition-all pb-4 animate-in fade-in duration-100", className)}
      {...props}
    >
      {children}
    </div>
  )
}
