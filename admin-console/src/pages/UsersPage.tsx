import { useRef } from "react";
import PageMeta from "@/components/common/PageMeta";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { adminApi, ApiError, downloadCsv, type UsageSummary } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { DownloadIcon, SearchIcon, TableIcon } from "@/icons";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function UsersPage() {
  const loadVersion = useRef(0);
  const { refresh } = useAuth();
  const [summary, setSummary] = useState<UsageSummary>();
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string>();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const version = ++loadVersion.current;
      try {
        const usage = await adminApi.usage(30, signal);
        if (signal?.aborted || version !== loadVersion.current) return;
        setMessage(undefined);
        setSummary(usage);
        setLoaded(true);
      } catch (error) {
        if (signal?.aborted || version !== loadVersion.current) return;
        if (error instanceof ApiError && error.status === 401) {
          await refresh();
          return;
        }
        setMessage(
          error instanceof ApiError && error.status === 0
            ? "You appear to be offline. Reconnect and try again."
            : error instanceof Error
              ? error.message
              : "Unable to load the protected user registry.",
        );
        setLoaded(true);
      }
    },
    [refresh],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const users = useMemo(
    () =>
      summary?.users.filter((user) =>
        user.studentKey.toLowerCase().includes(search.trim().toLowerCase()),
      ) ?? [],
    [summary, search],
  );

  function exportCsv() {
    downloadCsv("grademaxxing-protected-users.csv", [
      [
        "protected key",
        "first seen",
        "last seen",
        "active days",
        "active in range",
      ],
      ...users.map((user) => [
        user.studentKey,
        user.firstSeenAt,
        user.lastSeenAt,
        user.activeDays,
        user.activeInRange,
      ]),
    ]);
  }

  return (
    <>
      <PageMeta
        title="Grademaxxing Admin — Protected users"
        description="Anonymous protected user registry for Grademaxxing."
      />
      <div className="mx-auto max-w-(--breakpoint-2xl) p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Privacy-safe registry
            </p>
            <h1 className="mt-1 text-title-sm font-semibold text-gray-800 sm:text-title-md xl:text-title-xl dark:text-white/90">
              Protected user registry
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {summary?.users.length ?? "—"} protected keys — irreversible
              aliases, never student records.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={users.length === 0}
            onClick={exportCsv}
            startIcon={<DownloadIcon className="size-5" />}
          >
            Export CSV
          </Button>
        </div>

        {message && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-error-500 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/15 dark:text-error-400"
          >
            {message}
          </div>
        )}

        <div className="mb-6 w-full max-w-xs">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center">
              <SearchIcon className="size-5 fill-gray-500 dark:fill-gray-400" />
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search protected key"
              aria-label="Search protected key"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent ps-11 pe-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:text-white/90"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-y border-gray-100 dark:border-gray-800">
                <TableRow>
                  <TableCell
                    isHeader
                    className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
                  >
                    Protected key
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
                  >
                    First seen
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
                  >
                    Last seen
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
                  >
                    Active days
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
                  >
                    In range
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                {users.map((user) => (
                  <TableRow key={user.studentKey}>
                    <TableCell className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400">
                          <TableIcon className="size-5" />
                        </div>
                        <span className="font-mono text-theme-sm text-gray-700 dark:text-gray-300">
                          {user.studentKey}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {dateTime(user.firstSeenAt)}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {dateTime(user.lastSeenAt)}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {user.activeDays}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <Badge
                        color={user.activeInRange ? "success" : "light"}
                        size="sm"
                      >
                        {user.activeInRange ? "Active" : "Quiet"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {loaded && users.length === 0 && (
                  <TableRow>
                    <TableCell className="px-6 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                      No protected keys match this search.
                    </TableCell>
                  </TableRow>
                )}
                {!loaded && (
                  <TableRow>
                    <TableCell className="px-6 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                      Loading registry…
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </>
  );
}
