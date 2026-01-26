"use client";

import { cn } from "@/lib/utils";

type Position = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "middle-left" | "middle-right";

interface ScreenPositionSelectorProps {
  value: Position;
  onChange: (position: Position) => void;
}

export function ScreenPositionSelector({
  value,
  onChange,
}: ScreenPositionSelectorProps) {
  const positions: { id: Position; label: string }[] = [
    { id: "top-left", label: "Top Left" },
    { id: "top-right", label: "Top Right" },
    { id: "middle-left", label: "Middle Left" },
    { id: "middle-right", label: "Middle Right" },
    { id: "bottom-left", label: "Bottom Left" },
    { id: "bottom-right", label: "Bottom Right" },
  ];

  const getPositionClasses = (position: Position) => {
    switch (position) {
      case "top-left":
        return "top-2 left-2";
      case "top-right":
        return "top-2 right-2";
      case "bottom-left":
        return "bottom-2 left-2";
      case "bottom-right":
        return "bottom-2 right-2";
      case "middle-left":
        return "top-1/2 -translate-y-1/2 left-2";
      case "middle-right":
        return "top-1/2 -translate-y-1/2 right-2";
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Click a corner to set the subtitle anchor position
      </p>

      <div className="relative aspect-video w-full max-w-sm mx-auto overflow-hidden rounded-lg border-2 border-border bg-secondary/50">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-xs text-muted-foreground">Video Preview</div>
        </div>

        {positions.map((pos) => (
          <button
            key={pos.id}
            type="button"
            onClick={() => onChange(pos.id)}
            className={cn(
              "absolute flex h-10 w-10 items-center justify-center rounded-md border-2 transition-all",
              getPositionClasses(pos.id),
              value === pos.id
                ? "border-primary bg-primary/20 shadow-lg shadow-primary/20"
                : "border-border bg-card/80 hover:border-primary/50 hover:bg-primary/10"
            )}
          >
            <div
              className={cn(
                "h-3 w-3 rounded-full transition-colors",
                value === pos.id ? "bg-primary" : "bg-muted-foreground"
              )}
            />
          </button>
        ))}

        {value && (
          <div
            className={cn(
              "absolute max-w-[60%] rounded bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm",
              getPositionClasses(value)
            )}
            style={{
              transform: value.includes("right")
                ? "translateX(-12px)"
                : "translateX(12px)",
              marginTop: value.includes("middle") ? "0px" : (value.includes("top") ? "48px" : "-48px"),
            }}
          >
            <div className="space-y-0.5">
              <div className="text-primary">Username:</div>
              <div className="opacity-70">Sample chat message here</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {positions.map((pos) => (
          <button
            key={pos.id}
            type="button"
            onClick={() => onChange(pos.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              value === pos.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {pos.label}
          </button>
        ))}
      </div>
    </div>
  );
}
