<script lang="ts">
	import { fullDateFormatter, getRelativeTime, shortDateFormatter } from '$lib';
	import { Badge } from '$lib/components/ui/badge';

	interface Props {
		date: Date;
	}
	let { date }: Props = $props();
	let valid = $derived(!Number.isNaN(date.getTime()));
</script>

<Badge
	id={valid ? `date-${date.getTime()}` : undefined}
	variant="secondary"
	title={valid
		? `${fullDateFormatter.format(date)} (${getRelativeTime(date)})`
		: 'Date unavailable'}
>
	{valid ? shortDateFormatter.format(date) : 'Date unavailable'}
</Badge>
