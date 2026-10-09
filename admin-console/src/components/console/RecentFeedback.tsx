import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FeedbackItem } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { Link } from "react-router";
import StatusBadge from "./StatusBadge";

const kindColors: Record<
  FeedbackItem["kind"],
  "primary" | "warning" | "info" | "error"
> = {
  "Bug report": "error",
  "Grade question": "warning",
  "Feature idea": "info",
};

export default function RecentFeedback({
  items,
  onOpen,
}: {
  items: FeedbackItem[];
  onOpen: (item: FeedbackItem) => void;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between px-6 py-5">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Recent feedback
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Latest student messages across the product.
          </p>
        </div>
        <Link
          to="/feedback"
          className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
        >
          Open inbox
        </Link>
      </div>
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-t border-gray-100 dark:border-gray-800">
            <TableRow>
              <TableCell
                isHeader
                className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
              >
                Kind
              </TableCell>
              <TableCell
                isHeader
                className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
              >
                Message
              </TableCell>
              <TableCell
                isHeader
                className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
              >
                Status
              </TableCell>
              <TableCell
                isHeader
                className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
              >
                Received
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {items.slice(0, 5).map((item) => (
              <TableRow key={item.id}>
                <TableCell className="px-6 py-4">
                  <Badge color={kindColors[item.kind] ?? "primary"} size="sm">
                    {item.kind}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[280px] px-6 py-4">
                  <button
                    onClick={() => onOpen(item)}
                    className="block w-full truncate text-start text-theme-sm text-gray-700 hover:text-brand-500 dark:text-gray-300 dark:hover:text-brand-400"
                  >
                    {item.message}
                  </button>
                </TableCell>
                <TableCell className="px-6 py-4">
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell className="px-6 py-4 text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                  {relativeTime(item.createdAt)}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell className="px-6 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  No feedback yet — enjoy the silence.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
