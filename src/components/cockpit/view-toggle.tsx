import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = {
  readonly orgSlug: string;
  readonly active: "mapa" | "panel";
  readonly farmId?: string;
  readonly labels: { readonly mapa: string; readonly panel: string };
  readonly className?: string;
};

/** Two joined buttons, active = filled — per design board 2a top-left.
 * Preserves `?farm=` across the toggle. Server-renderable (plain Link), used
 * both floating over the map cockpit and in the panel dashboard's header
 * row. */
export function ViewToggle({ orgSlug, active, farmId, labels, className }: Props) {
  const farmQuery = farmId ? `&farm=${farmId}` : "";
  return (
    <div
      className={cn(
        "flex border border-border bg-background/95",
        className,
      )}
    >
      <Link
        href={`/o/${orgSlug}/dashboard?view=mapa${farmQuery}`}
        className={cn(
          "flex-1 px-3 py-1.5 text-center font-mono text-[11px] font-semibold",
          active === "mapa"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {labels.mapa}
      </Link>
      <Link
        href={`/o/${orgSlug}/dashboard?view=panel${farmQuery}`}
        className={cn(
          "flex-1 border-l border-border px-3 py-1.5 text-center font-mono text-[11px] font-semibold",
          active === "panel"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {labels.panel}
      </Link>
    </div>
  );
}
