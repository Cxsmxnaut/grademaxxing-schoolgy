<script lang="ts">
	interface Props {
		title: string;
		description: string;
		eyebrow?: string;
	}

	let { title, description, eyebrow = 'Student overview' }: Props = $props();
</script>

<header class="mb-5">
	<p class="text-primary mb-1.5 font-mono text-xs font-semibold tracking-[0.12em] uppercase">
		{eyebrow}
	</p>
	<h1 class="text-3xl font-bold tracking-[-0.025em] sm:text-4xl">{title}</h1>
	<p class="text-muted-foreground mt-1.5 max-w-2xl text-sm sm:text-base">{description}</p>
</header>
