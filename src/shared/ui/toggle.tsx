import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/shared/ui/utils"

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-2 rounded-lg text-sm leading-6 font-medium text-muted-foreground whitespace-nowrap outline-none transition-[background-color,color,border-color] duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40 aria-invalid:ring-destructive/20 aria-pressed:bg-control-selected aria-pressed:text-foreground aria-pressed:hover:bg-control-selected aria-pressed:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-border bg-card hover:bg-muted",
        chip: "rounded-full bg-transparent hover:bg-control",
      },
      size: {
        default:
          "h-8 min-w-8 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
          sm: "h-8 min-w-8 gap-1.5 px-2 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
          lg: "h-9 min-w-9 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
