export function dateTime(value: string | null | undefined): string {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function shortDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "never";
  const elapsedMs = Date.now() - new Date(value).getTime();
  if (elapsedMs < 60_000) return "just now";
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return dateTime(value);
}

export function percentDelta(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+100%" : "0%";
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change >= 0 ? "+" : ""}${change}%`;
}

export function isUp(current: number, previous: number): boolean {
  return current >= previous;
}
