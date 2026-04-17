import { cn } from "@shared-ui/utils";

interface BeeNiceLogoProps {
  compact?: boolean;
  className?: string;
}

export function BeeNiceLogo({ compact = false, className }: BeeNiceLogoProps) {
  if (compact) {
    return (
      <div
        className={cn(
          "benice-symbol inline-flex h-12 w-12 items-end rounded-[1.1rem] bg-[#001E5B] p-2.5 text-white shadow-[0_12px_30px_rgba(0,30,91,0.16)]",
          className,
        )}
      >
        <span className="bar h-2 w-1.5 rounded-full bg-white" />
        <span className="bar h-4 w-1.5 rounded-full bg-[#FFC755]" />
        <span className="bar h-6 w-1.5 rounded-full bg-[#F7A600]" />
        <span className="bar h-8 w-1.5 rounded-full bg-white" />
        <span className="ml-1 text-3xl font-semibold leading-none tracking-[-0.08em]">
          b
        </span>
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-end gap-3 text-[#001E5B]", className)}>
      <div className="benice-mark inline-flex items-end gap-1">
        <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,30,91,0.08)]" />
        <span className="h-4 w-2 rounded-full bg-[#FFC755]" />
        <span className="h-6 w-2 rounded-full bg-[#F7A600]" />
        <span className="h-8 w-2 rounded-full bg-[#001E5B]" />
        <span className="text-5xl font-semibold leading-none tracking-[-0.11em]">b</span>
      </div>
      <span className="font-display text-[2rem] leading-none tracking-[-0.08em]">
        bee nice
      </span>
    </div>
  );
}
