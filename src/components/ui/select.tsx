import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, Check } from "lucide-react"

const SelectContext = React.createContext<{
  value?: string
  onValueChange?: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
  items: Record<string, React.ReactNode>
  registerItem: (value: string, label: React.ReactNode) => () => void
} | null>(null)

export function Select({
  children,
  onValueChange,
  defaultValue,
  value: propValue,
}: {
  children: React.ReactNode
  onValueChange?: (value: string) => void
  defaultValue?: string
  value?: string
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "")
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [items, setItems] = React.useState<Record<string, React.ReactNode>>({})

  const value = propValue !== undefined ? propValue : internalValue
  
  const registerItem = React.useCallback((val: string, label: React.ReactNode) => {
    setItems((prev) => {
      if (prev[val] === label) return prev
      return { ...prev, [val]: label }
    })
    return () => {
      setItems((prev) => {
        if (!(val in prev)) return prev
        const copy = { ...prev }
        delete copy[val]
        return copy
      })
    }
  }, [])

  const handleValueChange = React.useCallback(
    (val: string) => {
      if (propValue === undefined) {
        setInternalValue(val)
      }
      onValueChange?.(val)
      setOpen(false)
    },
    [onValueChange, propValue]
  )

  React.useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  return (
    <SelectContext.Provider value={{ value, onValueChange: handleValueChange, open, setOpen, triggerRef, items, registerItem }}>
      <div ref={containerRef} className="relative inline-block w-full">{children}</div>
    </SelectContext.Provider>
  )
}

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectTrigger must be used inside Select")

  return (
    <button
      ref={context.triggerRef}
      type="button"
      onClick={() => context.setOpen(!context.open)}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 text-slate-900 text-right cursor-pointer gap-2",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
    </button>
  )
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectValue must be used inside Select")

  const displayValue = context.value ? context.items[context.value] : null

  return (
    <span className="truncate">
      {displayValue || placeholder || "اختر..."}
    </span>
  )
}

export function SelectContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectContent must be used inside Select")

  return (
    <div
      className={cn(
        "absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white p-1 text-slate-950 shadow-md focus:outline-none min-w-[8rem] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50",
        !context.open && "hidden",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function SelectItem({
  className,
  value,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectItem must be used inside Select")

  React.useEffect(() => {
    return context.registerItem(value, children)
  }, [value, children, context.registerItem])

  const isSelected = context.value === value

  const handleSelect = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    context.onValueChange?.(value);
  };

  return (
    <div
      onMouseDown={handleSelect}
      onClick={handleSelect}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-slate-100 focus:bg-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-right justify-between text-slate-900",
        className
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      {isSelected && (
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <Check className="h-4 w-4 text-blue-600" />
        </span>
      )}
    </div>
  )
}
