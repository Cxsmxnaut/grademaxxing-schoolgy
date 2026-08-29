<script lang="ts">
	import { fullDateFormatter, getRelativeTime, shortDateFormatter } from '$lib';
	import { Badge } from '$lib/components/ui/badge';

	interface Props {
		date: Date;
	}
	let { date }: Props = $props();
	const valid = $derived(Number.isFinite(date.getTime()));
	const title = $derived(
		valid ? `${fullDateFormatter.format(date)} (${getRelativeTime(date)})` : 'Date unavailable'
	);
</script>

<Badge variant="secondary" {title}>
	{valid ? shortDateFormatter.format(date) : 'Date unavailable'}
</Badge>
