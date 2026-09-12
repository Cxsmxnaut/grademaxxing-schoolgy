const relativeTimeFormatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

export function getRelativeTime(date: Date) {
	const now = new Date();
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const months = Math.floor(days / 30);
	const years = Math.floor(days / 365);

	if (seconds < 60) return relativeTimeFormatter.format(-seconds, 'second');
	if (minutes < 60) return relativeTimeFormatter.format(-minutes, 'minute');
	if (hours < 24) return relativeTimeFormatter.format(-hours, 'hour');
	if (days < 30) return relativeTimeFormatter.format(-days, 'day');
	if (months < 12) return relativeTimeFormatter.format(-months, 'month');
	return relativeTimeFormatter.format(-years, 'year');
}

export const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'numeric',
	day: 'numeric',
	year: 'numeric'
});

export const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
	dateStyle: 'full'
});
