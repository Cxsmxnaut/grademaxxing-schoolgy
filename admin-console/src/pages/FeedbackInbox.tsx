import { useRef } from "react";
import PageMeta from "@/components/common/PageMeta";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import StatusBadge, { statusLabel } from "@/components/console/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import {
  adminApi,
  ApiError,
  downloadJson,
  feedbackStatuses,
  type FeedbackItem,
  type FeedbackKind,
  type FeedbackStatus,
} from "@/lib/api";
import { dateTime, relativeTime } from "@/lib/format";
import {
  DownloadIcon,
  PaperPlaneIcon,
  PlusLineIcon,
  SearchIcon,
} from "@/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

const kinds: FeedbackKind[] = ["Bug report", "Grade question", "Feature idea"];

const kindColors: Record<
  FeedbackItem["kind"],
  "primary" | "warning" | "info" | "error"
> = {
  "Bug report": "error",
  "Grade question": "warning",
  "Feature idea": "info",
};

export default function FeedbackInbox() {
  const loadVersion = useRef(0);
  const { refresh } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">(
    (searchParams.get("status") as FeedbackStatus | null) ?? "all",
  );
  const [kindFilter, setKindFilter] = useState<FeedbackKind | "all">("all");
  const [selectedId, setSelectedId] = useState<string | undefined>(
    searchParams.get("item") ?? undefined,
  );
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const version = ++loadVersion.current;
      try {
        const result = await adminApi.feedback(signal);
        if (signal?.aborted || version !== loadVersion.current) return;
        setMessage(undefined);
        setItems(result.items);
        setNoteDrafts(
          Object.fromEntries(
            result.items.map((item) => [item.id, item.adminNote ?? ""]),
          ),
        );
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
              : "Unable to load feedback.",
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

  const counts = useMemo(() => {
    const byStatus: Record<FeedbackStatus, number> = {
      new: 0,
      reviewing: 0,
      planned: 0,
      resolved: 0,
      dismissed: 0,
    };
    for (const item of items) byStatus[item.status] += 1;
    return byStatus;
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      return (
        (statusFilter === "all" || item.status === statusFilter) &&
        (kindFilter === "all" || item.kind === kindFilter) &&
        (!query ||
          item.message.toLowerCase().includes(query) ||
          item.messages.some((entry) =>
            entry.message.toLowerCase().includes(query),
          ) ||
          item.kind.toLowerCase().includes(query) ||
          item.pagePath.toLowerCase().includes(query))
      );
    });
  }, [items, search, statusFilter, kindFilter]);

  const selected =
    filtered.find((item) => item.id === selectedId) ?? filtered[0];

  function selectItem(item: FeedbackItem) {
    setSelectedId(item.id);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("item", item.id);
        return next;
      },
      { replace: true },
    );
  }

  async function saveStatus(item: FeedbackItem, status: FeedbackStatus) {
    setSavingId(item.id);
    setMessage(undefined);
    try {
      await adminApi.saveFeedback({
        id: item.id,
        status,
        adminNote: noteDrafts[item.id] ?? item.adminNote,
        adminReply: item.adminReply,
      });
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, status, updatedAt: new Date().toISOString() }
            : entry,
        ),
      );
      setNotice(`Moved to ${statusLabel(status)}.`);
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 0
          ? "You appear to be offline. Reconnect and try again."
          : error instanceof Error
            ? error.message
            : "Unable to save feedback.",
      );
    } finally {
      setSavingId(undefined);
    }
  }

  async function saveNote(item: FeedbackItem) {
    setSavingId(item.id);
    setMessage(undefined);
    try {
      const adminNote = noteDrafts[item.id] ?? "";
      await adminApi.saveFeedback({
        id: item.id,
        status: item.status,
        adminNote,
        adminReply: item.adminReply,
      });
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, adminNote, updatedAt: new Date().toISOString() }
            : entry,
        ),
      );
      setNotice("Private note saved.");
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 0
          ? "You appear to be offline. Reconnect and try again."
          : error instanceof Error
            ? error.message
            : "Unable to save the private note.",
      );
    } finally {
      setSavingId(undefined);
    }
  }

  async function sendReply(item: FeedbackItem) {
    const reply = (replyDrafts[item.id] ?? "").trim();
    if (!reply || savingId) return;
    setSavingId(item.id);
    setMessage(undefined);
    setNotice(undefined);
    try {
      const sent = await adminApi.sendFeedbackMessage(item.id, reply);
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                messages: [...entry.messages, sent],
                repliedAt: sent.createdAt,
                updatedAt: sent.createdAt,
              }
            : entry,
        ),
      );
      setReplyDrafts((current) => ({ ...current, [item.id]: "" }));
      setNotice("Reply sent.");
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 0
          ? "You appear to be offline. Reconnect and try again."
          : error instanceof Error
            ? error.message
            : "Unable to send the reply.",
      );
    } finally {
      setSavingId(undefined);
    }
  }

  return (
    <>
      <PageMeta
        title="Grademaxxing Admin — Feedback inbox"
        description="Triage and reply to Grademaxxing student feedback."
      />
      <div className="mx-auto max-w-(--breakpoint-2xl) p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Support</p>
            <h1 className="mt-1 text-title-sm font-semibold text-gray-800 sm:text-title-md xl:text-title-xl dark:text-white/90">
              Feedback inbox
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {counts.new} new · {counts.reviewing} reviewing · {counts.planned}{" "}
              planned · {counts.resolved} resolved
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            startIcon={<DownloadIcon className="size-5" />}
            onClick={() =>
              downloadJson(
                `grademaxxing-feedback-${new Date().toISOString().slice(0, 10)}.json`,
                items,
              )
            }
          >
            Export JSON
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
        {notice && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-success-500 bg-success-50 px-4 py-3 text-sm text-success-600 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-500"
          >
            {notice}
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center">
              <SearchIcon className="size-5 fill-gray-500 dark:fill-gray-400" />
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchParams(
                  (current) => {
                    const next = new URLSearchParams(current);
                    if (event.target.value)
                      next.set("search", event.target.value);
                    else next.delete("search");
                    return next;
                  },
                  { replace: true },
                );
              }}
              placeholder="Search feedback"
              aria-label="Search feedback"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent ps-11 pe-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:text-white/90"
            />
          </div>
          <select
            value={kindFilter}
            onChange={(event) =>
              setKindFilter(event.target.value as FeedbackKind | "all")
            }
            aria-label="Filter by kind"
            className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="all">All kinds</option>
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", ...feedbackStatuses] as const).map((status) => (
              <button
                key={status}
                onClick={() =>
                  setStatusFilter(status as FeedbackStatus | "all")
                }
                aria-pressed={statusFilter === status}
                className={`rounded-full px-3.5 py-1.5 text-theme-sm font-medium transition-colors ${
                  statusFilter === status
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                }`}
              >
                {status === "all"
                  ? "All"
                  : `${statusLabel(status as FeedbackStatus)}${
                      counts[status as FeedbackStatus]
                        ? ` (${counts[status as FeedbackStatus]})`
                        : ""
                    }`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white xl:col-span-2 dark:border-gray-800 dark:bg-white/[0.03]">
            <ul className="max-h-[70vh] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => selectItem(item)}
                    className={`block w-full px-5 py-4 text-start transition-colors ${
                      selected?.id === item.id
                        ? "bg-brand-50/60 dark:bg-brand-500/10"
                        : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge color={kindColors[item.kind]} size="sm">
                        {item.kind}
                      </Badge>
                      <span className="text-theme-xs text-gray-400">
                        {relativeTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-theme-sm text-gray-700 dark:text-gray-300">
                      {item.message}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <StatusBadge status={item.status} />
                      {item.messages.length > 1 && (
                        <span className="text-theme-xs text-gray-400">
                          {item.messages.length} messages
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
              {loaded && filtered.length === 0 && (
                <li className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                  Nothing matches these filters.
                </li>
              )}
              {!loaded && (
                <li className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                  Loading feedback…
                </li>
              )}
            </ul>
          </div>

          <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6 xl:col-span-3 dark:border-gray-800 dark:bg-white/[0.03]">
            {selected ? (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge color={kindColors[selected.kind]} size="sm">
                        {selected.kind}
                      </Badge>
                      <StatusBadge status={selected.status} />
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      {selected.pagePath} · v{selected.appVersion} · received{" "}
                      {dateTime(selected.createdAt)}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-theme-sm text-gray-500 dark:text-gray-400">
                    Status
                    <select
                      value={selected.status}
                      aria-label={`Status for ${selected.kind}`}
                      onChange={(event) =>
                        void saveStatus(
                          selected,
                          event.target.value as FeedbackStatus,
                        )
                      }
                      disabled={savingId === selected.id}
                      className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                    >
                      {feedbackStatuses.map((status) => (
                        <option key={status} value={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-6 space-y-3">
                  {selected.messages.map((entry) => (
                    <div
                      key={entry.id}
                      className={`message-bubble max-w-[85%] rounded-2xl px-4 py-3 ${
                        entry.sender === "admin"
                          ? "ms-auto bg-brand-500/10 text-gray-800 dark:bg-brand-500/20 dark:text-white/90"
                          : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"
                      }`}
                    >
                      <p className="text-theme-sm">{entry.message}</p>
                      <p className="mt-1 text-theme-xs text-gray-400">
                        {entry.sender === "admin" ? "Admin" : "Student"} ·{" "}
                        {dateTime(entry.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <label
                    htmlFor="reply-draft"
                    className="block text-theme-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Reply to {selected.kind}
                  </label>
                  <textarea
                    id="reply-draft"
                    rows={3}
                    value={replyDrafts[selected.id] ?? ""}
                    onChange={(event) =>
                      setReplyDrafts((current) => ({
                        ...current,
                        [selected.id]: event.target.value,
                      }))
                    }
                    placeholder="Write a reply the student will receive…"
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:text-white/90"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      disabled={
                        savingId === selected.id ||
                        !(replyDrafts[selected.id] ?? "").trim()
                      }
                      onClick={() => void sendReply(selected)}
                      startIcon={<PaperPlaneIcon className="size-5" />}
                    >
                      Send reply
                    </Button>
                  </div>
                </div>

                <div className="mt-6 border-t border-gray-100 pt-6 dark:border-gray-800">
                  <label
                    htmlFor="admin-note"
                    className="block text-theme-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Private admin note
                  </label>
                  <textarea
                    id="admin-note"
                    rows={2}
                    value={noteDrafts[selected.id] ?? ""}
                    onChange={(event) =>
                      setNoteDrafts((current) => ({
                        ...current,
                        [selected.id]: event.target.value,
                      }))
                    }
                    placeholder="Only visible to admins…"
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:text-white/90"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={savingId === selected.id}
                      onClick={() => void saveNote(selected)}
                      startIcon={<PlusLineIcon className="size-5" />}
                    >
                      Save private note
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center py-16 text-sm text-gray-400 dark:text-gray-500">
                Select a conversation to read and reply.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
