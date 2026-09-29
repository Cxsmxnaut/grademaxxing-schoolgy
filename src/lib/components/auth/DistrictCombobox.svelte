<script lang="ts">
	import { DISTRICTS, type StudentVueDistrict } from '$lib/data/districts';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import XIcon from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';

	let {
		value,
		onselect,
		onvalueinput = () => undefined,
		disabled = false
	}: {
		value: string;
		onselect: (district: StudentVueDistrict) => void;
		onvalueinput?: (value: string) => void;
		disabled?: boolean;
	} = $props();

	const selectedAtStart = DISTRICTS.find((district) => district.domain === normalizedTarget(value));
	let query = $state(selectedAtStart?.name ?? '');
	let editing = $state(selectedAtStart === undefined);
	let open = $state(false);
	let showAll = $state(false);
	let activeIndex = $state(0);

	const normalizedQuery = $derived(query.trim().toLocaleLowerCase());
	const selectedDistrict = $derived(
		DISTRICTS.find((district) => district.domain === normalizedTarget(value))
	);
	const matches = $derived.by(() => {
		if (showAll || !normalizedQuery) return DISTRICTS;

		return DISTRICTS.map((district, originalIndex) => ({
			district,
			originalIndex,
			score: districtSearchScore(district, normalizedQuery)
		}))
			.filter((result): result is typeof result & { score: number } => result.score !== undefined)
			.sort((a, b) => a.score - b.score || a.originalIndex - b.originalIndex)
			.map((result) => result.district);
	});

	function normalizedTarget(input: string) {
		try {
			const url = new URL(input.includes('://') ? input : `https://${input}`);
			const path = url.pathname.replace(/^\/+|\/+$/g, '');
			return `${url.host.toLowerCase()}${path ? `/${path.toLowerCase()}` : ''}`;
		} catch {
			return '';
		}
	}

	function districtSearchScore(district: StudentVueDistrict, search: string) {
		const name = district.name.toLocaleLowerCase();
		const state = district.state.toLocaleLowerCase();
		const domain = district.domain.toLocaleLowerCase();

		if (name === search) return 0;
		if (name.startsWith(search)) return 1;
		if (name.split(/\s+/).some((word) => word.startsWith(search))) return 2;
		if (name.includes(search)) return 3;
		if (state.startsWith(search)) return 4;
		if (domain.includes(search)) return 5;
		return undefined;
	}

	async function moveActive(nextIndex: number) {
		activeIndex = Math.max(0, Math.min(nextIndex, matches.length - 1));
		await tick();
		document.getElementById(`district-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
	}

	function choose(district: StudentVueDistrict) {
		query = district.name;
		editing = false;
		open = false;
		showAll = false;
		activeIndex = 0;
		onselect(district);
	}

	function handleInput(event: Event) {
		query = (event.currentTarget as HTMLInputElement).value;
		onvalueinput(query);
		showAll = false;
		open = true;
		activeIndex = 0;
	}

	function handleKeydown(event: KeyboardEvent) {
		const activeMatch = matches[activeIndex];
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (!open) open = true;
			else void moveActive(activeIndex + 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (!open) {
				open = true;
				void moveActive(matches.length - 1);
			} else void moveActive(activeIndex - 1);
		} else if (event.key === 'Enter' && open && activeMatch) {
			event.preventDefault();
			choose(activeMatch);
		} else if (event.key === 'Escape') {
			open = false;
			showAll = false;
		}
	}

	function closeAfterFocusLeaves(event: FocusEvent) {
		const container = event.currentTarget as HTMLElement;
		requestAnimationFrame(() => {
			if (!container.contains(document.activeElement)) {
				open = false;
				showAll = false;
			}
		});
	}
</script>

<div class="relative" onfocusout={closeAfterFocusLeaves}>
	<label
		for={editing ? 'district-search' : undefined}
		class="text-muted-foreground mb-1.5 block text-[0.78125rem] leading-[1.172rem] font-semibold"
		>School district</label
	>
	{#if !editing && selectedDistrict}
		<div
			class="border-input bg-secondary text-foreground flex h-12 items-center gap-2.5 rounded-[0.625rem] border px-4 py-3 text-[0.90625rem] leading-[1.5] font-semibold"
		>
			<span class="min-w-0 flex-1 truncate">
				{selectedDistrict.name}
			</span>
			<button
				type="button"
				class="text-primary hover:text-foreground shrink-0 text-[0.78125rem] leading-normal font-semibold underline underline-offset-2"
				{disabled}
				onclick={async () => {
					editing = true;
					showAll = true;
					open = true;
					await tick();
					document.getElementById('district-search')?.focus();
				}}
			>
				Change
			</button>
		</div>
	{:else}
		<div
			class="border-input bg-secondary focus-within:border-primary focus-within:outline-primary flex h-12 items-center overflow-hidden rounded-[0.625rem] border focus-within:outline-2 focus-within:outline-offset-2"
		>
			<input
				id="district-search"
				type="text"
				role="combobox"
				aria-label="StudentVUE Domain"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls="district-listbox"
				aria-activedescendant={open && matches[activeIndex]
					? `district-option-${activeIndex}`
					: undefined}
				autocomplete="off"
				autocapitalize="off"
				autocorrect="off"
				{disabled}
				placeholder="Search by district, state, or portal"
				value={query}
				oninput={handleInput}
				onfocus={() => (open = true)}
				onkeydown={handleKeydown}
				class="text-foreground placeholder:text-tertiary-foreground h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-sm outline-none"
			/>
			{#if query}
				<button
					type="button"
					aria-label="Clear district search"
					{disabled}
					onmousedown={(event) => event.preventDefault()}
					onclick={() => {
						query = '';
						onvalueinput('');
						showAll = false;
						open = true;
						activeIndex = 0;
					}}
					class="text-muted-foreground hover:text-foreground grid h-full w-9 shrink-0 place-items-center"
				>
					<XIcon class="size-4" />
				</button>
			{/if}
			<button
				type="button"
				aria-label={open ? 'Close district list' : 'Open district list'}
				aria-expanded={open}
				{disabled}
				onmousedown={(event) => event.preventDefault()}
				onclick={() => {
					if (open && showAll) {
						open = false;
						showAll = false;
					} else {
						showAll = true;
						open = true;
						const selectedIndex = DISTRICTS.findIndex(
							(district) => district.domain === normalizedTarget(value)
						);
						void moveActive(selectedIndex < 0 ? 0 : selectedIndex);
					}
				}}
				class="border-input text-muted-foreground hover:bg-accent hover:text-foreground grid h-full w-10 shrink-0 place-items-center border-l"
			>
				<ChevronDownIcon class={`size-5 transition-transform ${open ? 'rotate-180' : ''}`} />
			</button>
		</div>
	{/if}

	{#if editing && open}
		<div
			id="district-listbox"
			role="listbox"
			aria-label="Matching school districts"
			class="border-border bg-popover absolute top-[calc(100%+0.5rem)] right-0 left-0 z-30 max-h-72 overflow-y-auto rounded-xl border p-1.5 shadow-2xl shadow-black/40"
		>
			{#if matches.length}
				{#each matches as district, index (`${district.domain}-${district.name}`)}
					<button
						id={`district-option-${index}`}
						type="button"
						role="option"
						aria-selected={district.domain === normalizedTarget(value)}
						onmousedown={(event) => event.preventDefault()}
						onmouseenter={() => (activeIndex = index)}
						onclick={() => choose(district)}
						class={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
							index === activeIndex ? 'bg-accent' : 'hover:bg-accent/70'
						}`}
					>
						<span class="min-w-0 flex-1">
							<span class="text-foreground block truncate font-medium">{district.name}</span>
							<span class="text-muted-foreground block truncate text-xs">{district.domain}</span>
						</span>
						<span class="text-muted-foreground shrink-0 text-xs">{district.state}</span>
						{#if district.domain === normalizedTarget(value)}
							<CheckIcon class="text-primary size-4 shrink-0" />
						{/if}
					</button>
				{/each}
			{:else}
				<p class="text-muted-foreground px-3 py-4 text-sm">No matching school districts</p>
			{/if}
		</div>
	{/if}
</div>
