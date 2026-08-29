<script lang="ts">
	import { DISTRICTS, type StudentVueDistrict } from '$lib/data/districts';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import XIcon from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';

	let {
		value,
		onselect
	}: {
		value: string;
		onselect: (district: StudentVueDistrict) => void;
	} = $props();

	const selectedAtStart = DISTRICTS.find((district) => district.domain === normalizedTarget(value));
	let query = $state(selectedAtStart?.name ?? '');
	let open = $state(false);
	let showAll = $state(false);
	let activeIndex = $state(0);

	const normalizedQuery = $derived(query.trim().toLocaleLowerCase());
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
		open = false;
		showAll = false;
		activeIndex = 0;
		onselect(district);
	}

	function handleInput(event: Event) {
		query = (event.currentTarget as HTMLInputElement).value;
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
	<label for="district-search" class="mb-2 block text-sm font-semibold text-[#91aac2]"
		>Choose your school district</label
	>
	<div
		class="flex h-12 items-center overflow-hidden rounded-xl border border-[#294258] bg-[#071522] focus-within:border-[#55baf3] focus-within:ring-2 focus-within:ring-[#55baf3]/25"
	>
		<input
			id="district-search"
			type="text"
			role="combobox"
			aria-label="School district"
			aria-autocomplete="list"
			aria-expanded={open}
			aria-controls="district-listbox"
			aria-activedescendant={open && matches[activeIndex]
				? `district-option-${activeIndex}`
				: undefined}
			autocomplete="off"
			placeholder="Search by district, state, or portal"
			value={query}
			oninput={handleInput}
			onfocus={() => (open = true)}
			onkeydown={handleKeydown}
			class="h-full min-w-0 flex-1 border-0 bg-transparent px-4 text-base text-[#e4eef8] outline-none placeholder:text-[#68839c]"
		/>
		{#if query}
			<button
				type="button"
				aria-label="Clear district search"
				onmousedown={(event) => event.preventDefault()}
				onclick={() => {
					query = '';
					showAll = false;
					open = true;
					activeIndex = 0;
				}}
				class="grid h-full w-10 shrink-0 place-items-center text-[#91aac2] hover:text-white"
			>
				<XIcon class="size-4" />
			</button>
		{/if}
		<button
			type="button"
			aria-label={open ? 'Close district list' : 'Open district list'}
			aria-expanded={open}
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
			class="grid h-full w-11 shrink-0 place-items-center border-l border-[#294258] text-[#b4c6d7] hover:bg-white/5 hover:text-white"
		>
			<ChevronDownIcon class={`size-5 transition-transform ${open ? 'rotate-180' : ''}`} />
		</button>
	</div>

	{#if open}
		<div
			id="district-listbox"
			role="listbox"
			aria-label="Matching school districts"
			class="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-30 max-h-72 overflow-y-auto rounded-xl border border-[#294258] bg-[#0a1c2c] p-1.5 shadow-2xl shadow-black/40"
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
							index === activeIndex ? 'bg-[#183650]' : 'hover:bg-white/5'
						}`}
					>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium text-[#e4eef8]">{district.name}</span>
							<span class="block truncate text-xs text-[#7893ab]">{district.domain}</span>
						</span>
						<span class="shrink-0 text-xs text-[#91aac2]">{district.state}</span>
						{#if district.domain === normalizedTarget(value)}
							<CheckIcon class="size-4 shrink-0 text-[#55baf3]" />
						{/if}
					</button>
				{/each}
			{:else}
				<p class="px-3 py-4 text-sm text-[#91aac2]">No matching school districts</p>
			{/if}
		</div>
	{/if}
</div>
