"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  items: string[]
  placeholder?: string
  className?: string
  searchPlaceholder?: string
  disabled?: boolean
}

export function Combobox({
  value,
  onChange,
  items,
  placeholder = "Select...",
  className,
  searchPlaceholder = "Search...",
  disabled = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="default"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            // Black pill button styling
            "w-fit min-w-[120px] justify-between rounded-full px-4 py-1 h-7",
            "bg-ink-900 text-ink-0 border-none shadow-none",
            "hover:bg-ink-800 hover:text-ink-0",
            "font-normal tracking-normal",
            disabled && "opacity-70 cursor-not-allowed",
            className
          )}
        >
          {value || placeholder}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[200px] p-0 rounded-lg border-ink-300 bg-white"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandEmpty>No results.</CommandEmpty>

          <CommandGroup className="max-h-[100px] overflow-auto">
            {items.map((item) => (
              <CommandItem
                key={item}
                value={item}
                onSelect={() => {
                  onChange(item)
                  setOpen(false)
                }}
                className="cursor-pointer"
              >
                {item}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
