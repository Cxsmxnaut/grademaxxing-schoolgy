<script lang="ts">
	let { title, message } = $props<{ title: string; message: string }>();
</script>

<section class="border-border bg-card rounded-xl border p-8">
	<h2 class="font-heading text-xl font-semibold">{title}</h2>
	<p class="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">{message}</p>
</section>
