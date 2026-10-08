import Badge from "@/components/ui/badge/Badge";
import type { FeedbackStatus } from "@/lib/api";

const statusMeta: Record<
  FeedbackStatus,
  {
    label: string;
    color: "primary" | "warning" | "info" | "success" | "light";
  }
> = {
  new: { label: "New", color: "primary" },
  reviewing: { label: "Reviewing", color: "warning" },
  planned: { label: "Planned", color: "info" },
  resolved: { label: "Resolved", color: "success" },
  dismissed: { label: "Dismissed", color: "light" },
};

export default function StatusBadge({ status }: { status: FeedbackStatus }) {
  const meta = statusMeta[status];
  return (
    <Badge color={meta.color} size="sm">
      {meta.label}
    </Badge>
  );
}

export function statusLabel(status: FeedbackStatus): string {
  return statusMeta[status].label;
}
