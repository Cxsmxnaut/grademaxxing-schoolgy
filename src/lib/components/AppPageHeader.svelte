<script lang="ts">
	interface Props {
		title: string;
		description: string;
		eyebrow?: string;
	}

	let { title, description, eyebrow = 'Student overview' }: Props = $props();
</script>

<header class="mb-7">
	<p class="text-primary mb-2 font-mono text-[0.6875rem] font-semibold tracking-[0.18em] uppercase">
		{eyebrow}
	</p>
	<h1 class="text-[1.875rem] leading-[1.2] font-bold tracking-[-0.025em]">{title}</h1>
	<p class="text-muted-foreground mt-2 max-w-3xl text-[0.90625rem] leading-[1.5]">{description}</p>
</header>
