import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import StatusBadge from "@/components/console/StatusBadge";
import { adminApi, type FeedbackItem } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { BellAltIcon } from "@/icons";
import { useState } from "react";
import { Link } from "react-router";

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function openDropdown() {
    const next = !isOpen;
    setIsOpen(next);
    if (next && !loaded) {
      try {
        const result = await adminApi.feedback();
        setItems(
          result.items.filter(
            (item) => item.status !== "resolved" && item.status !== "dismissed",
          ),
        );
      } catch {
        setItems([]);
      }
      setLoaded(true);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => void openDropdown()}
        className="dropdown-toggle relative flex size-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        aria-label="Open notifications"
      >
        <BellAltIcon className="size-6" />
        {items.length > 0 && (
          <span className="absolute top-2.5 end-2.5 size-2 rounded-full bg-error-500">
            <span className="absolute inset-0 animate-ping rounded-full bg-error-500 opacity-50" />
          </span>
        )}
      </button>

      <Dropdown isOpen={isOpen} onClose={() => setIsOpen(false)} className="w-80">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Open feedback
          </p>
          {items.length > 0 && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-theme-xs font-medium text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
              {items.length}
            </span>
          )}
        </div>
        <ul className="max-h-72 overflow-y-auto border-t border-gray-100 dark:border-gray-800">
          {items.slice(0, 6).map((item) => (
            <li key={item.id}>
              <Link
                to={`/feedback?item=${item.id}`}
                onClick={() => setIsOpen(false)}
                className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={item.status} />
                  <span className="text-theme-xs text-gray-400">
                    {relativeTime(item.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-theme-sm text-gray-600 dark:text-gray-300">
                  {item.message}
                </p>
              </Link>
            </li>
          ))}
          {loaded && items.length === 0 && (
            <li className="px-4 py-8 text-center text-theme-sm text-gray-400">
              Nothing open — inbox zero.
            </li>
          )}
          {!loaded && (
            <li className="px-4 py-8 text-center text-theme-sm text-gray-400">
              Loading…
            </li>
          )}
        </ul>
        <Link
          to="/feedback"
          onClick={() => setIsOpen(false)}
          className="block border-t border-gray-100 px-4 py-3 text-center text-theme-sm font-medium text-brand-500 hover:text-brand-600 dark:border-gray-800 dark:text-brand-400"
        >
          View all feedback
        </Link>
      </Dropdown>
    </div>
  );
}
