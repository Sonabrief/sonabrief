import React, { type ComponentPropsWithoutRef, type CSSProperties } from "react"
import { cn } from "@/lib/utils"

export interface ShimmerButtonProps extends ComponentPropsWithoutRef<"button"> {
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
  className?: string
  children?: React.ReactNode
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = "rgba(200, 152, 104, 0.6)",
      shimmerSize = "0.05em",
      shimmerDuration = "3s",
      borderRadius = "6px",
      background = "rgba(26, 77, 82, 1)",
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        style={{
          borderRadius,
          background,
          "--spread": "90deg",
          "--shimmer-color": shimmerColor,
          "--speed": shimmerDuration,
          "--cut": shimmerSize,
        } as CSSProperties}
        className={cn(
          "group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden px-6 py-3 whitespace-nowrap text-white",
          "transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px",
          className
        )}
        ref={ref}
        {...props}
      >
        {/* shimmer layer */}
        <span
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          style={{ borderRadius }}
          aria-hidden="true"
        >
          <span
            className="animate-spin-around absolute -inset-[100%] w-[300%]"
            style={{
              background: `conic-gradient(from calc(270deg - (var(--spread) * 0.5)), transparent 0, var(--shimmer-color) var(--spread), transparent var(--spread))`,
              "--spread": "90deg",
              "--shimmer-color": shimmerColor,
            } as CSSProperties}
          />
        </span>
        {children}
        {/* highlight */}
        <span
          className="pointer-events-none absolute inset-0 -z-[5] rounded-[inherit] shadow-[inset_0_-8px_10px_rgba(200,152,104,0.15)] transition-shadow duration-300 group-hover:shadow-[inset_0_-6px_10px_rgba(200,152,104,0.25)]"
          aria-hidden="true"
        />
      </button>
    )
  }
)
ShimmerButton.displayName = "ShimmerButton"
