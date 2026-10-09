<script lang="ts">
	import type { BadgeColor } from '$lib/components/ui/badge/colors';
	import DateBadge from '$lib/components/DateBadge.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { NumberInput } from '$lib/components/ui/input/index';
	import { Label } from '$lib/components/ui/label';
	import * as Popover from '$lib/components/ui/popover';
	import { Progress } from '$lib/components/ui/progress';
	import { calculateGradePercentage } from '$lib/grades/assignments';
	import { formatPercentage } from '$lib/grades/percentage-format';
	import MessageCircleIcon from '@lucide/svelte/icons/message-circle';
	import TextAlignStartIcon from '@lucide/svelte/icons/text-align-start';
	import { tick } from 'svelte';

	type Props = {
		name: string;
		id: string;
		description?: string;
		pointsEarned?: number;
		pointsPossible?: number;
		unscaledPoints?: { pointsEarned: number; pointsPossible: number };
		officialPercentage?: number;
		calculationUnavailable?: boolean;
		calculationIssue?: 'points' | 'category';
		pointsScaleUnavailable?: boolean;
		zeroWeightCategory?: boolean;
		extraCredit?: boolean;
		gradePercentageChange?: number;
		notForGrade?: boolean;
		showHypotheticalLabel?: boolean;
		categoryBadge?: { name: string; color: BadgeColor };
		date?: Date | undefined;
		editable?: boolean;
		unseen?: boolean;
		comments?: string;
		recalculateGradePercentage?: () => void;
		onRemove?: (() => void) | undefined;
	} & (
		| {
				editable?: false;
				categoryDropdownSelected?: undefined;
				categoryDropdown?: undefined;
		  }
		| {
				editable: true;
				categoryDropdownSelected?: string | undefined;
				categoryDropdown?: { names: Set<string>; colors?: Map<string, BadgeColor> };
		  }
	);
	let {
		name = $bindable(),
		id,
		description,
		pointsEarned = $bindable(),
		pointsPossible = $bindable(),
		unscaledPoints = $bindable(),
		officialPercentage,
		calculationUnavailable = false,
		calculationIssue,
		pointsScaleUnavailable = false,
		zeroWeightCategory = false,
		extraCredit = $bindable(false),
		gradePercentageChange,
		notForGrade = $bindable(false),
		showHypotheticalLabel = false,
		categoryBadge,
		categoryDropdownSelected = $bindable(undefined),
		categoryDropdown,
		date = undefined,
		editable = false,
		unseen = false,
		comments = undefined,
		recalculateGradePercentage = () => {},
		onRemove = undefined
	}: Props = $props();

	const hasOfficialPercentage = $derived(
		officialPercentage !== undefined && Number.isFinite(officialPercentage)
	);
	const hasRawScore = $derived(
		unscaledPoints !== undefined &&
			Number.isFinite(unscaledPoints.pointsEarned) &&
			Number.isFinite(unscaledPoints.pointsPossible)
	);
	const hasWeightedPoints = $derived(
		pointsEarned !== undefined &&
			Number.isFinite(pointsEarned) &&
			pointsPossible !== undefined &&
			Number.isFinite(pointsPossible) &&
			pointsPossible >= 0
	);
	const isGraded = $derived(pointsEarned !== undefined || hasOfficialPercentage || hasRawScore);
	const weightedPointsUnavailable = $derived(
		!zeroWeightCategory &&
			(calculationIssue === 'points' ||
				calculationUnavailable ||
				(!hasWeightedPoints &&
					!(hasOfficialPercentage && pointsPossible !== undefined && pointsPossible > 0)))
	);
	const weightedBasisUnavailable = $derived(
		calculationUnavailable || pointsScaleUnavailable || calculationIssue === 'points'
	);
	const cannotEditPoints = $derived(weightedBasisUnavailable || calculationIssue !== undefined);
	const cannotIncludeInGrade = $derived(cannotEditPoints);
	const calculationRestriction = $derived(
		calculationIssue === 'category'
			? 'StudentVUE has not supplied a valid weight for this category.'
			: 'Weighted points are needed to change this assignment in a what-if grade.'
	);
	const percentage = $derived(
		hasOfficialPercentage
			? officialPercentage!
			: hasWeightedPoints && pointsPossible! > 0
				? calculateGradePercentage(pointsEarned!, pointsPossible!)
				: Number.NaN
	);

	const progressValue = $derived(
		Number.isFinite(percentage) ? Math.min(Math.max(percentage, 0), 100) : 0
	);
	const progressValueText = $derived(
		Number.isFinite(percentage) ? `${formatPercentage(percentage)}%` : 'Percentage unavailable'
	);

	const progressIndicatorClass = $derived.by(() => {
		if (extraCredit) return 'bg-grade-extra';
		if (percentage >= 90) return 'bg-grade-strong';
		if (percentage >= 80) return 'bg-grade-watch';
		return 'bg-grade-risk';
	});
	const percentageTextClass = $derived.by(() => {
		if (extraCredit || percentage > 100) return 'text-grade-extra';
		if (percentage >= 90) return 'text-grade-strong';
		if (percentage >= 80) return 'text-grade-watch';
		return 'text-grade-risk';
	});
	const categoryColorHex: Partial<Record<BadgeColor, string>> = {
		red: '#d95c5c',
		orange: '#e58a45',
		amber: '#dba63d',
		yellow: '#c7b33f',
		lime: '#6ba84f',
		green: '#4faf78',
		emerald: '#54c990',
		teal: '#49b6a6',
		cyan: '#4db6d5',
		sky: '#4db6f5',
		blue: '#5a8ee8',
		indigo: '#7278de',
		violet: '#936fd6',
		purple: '#a66ccc',
		fuchsia: '#c65db2',
		pink: '#d76592',
		rose: '#d95c72',
		default: '#7d98b1'
	};
	const categorySelectColor = $derived.by(() => {
		if (!categoryDropdownSelected || !categoryDropdown?.colors) return '#7d98b1';
		return (
			categoryColorHex[categoryDropdown.colors.get(categoryDropdownSelected) ?? 'default'] ??
			'#7d98b1'
		);
	});

	const gradePercentageChangeRounded = $derived(
		Math.round((gradePercentageChange ?? 0) * 100) / 100
	);
	const showGradePercentageChange = $derived(
		gradePercentageChange !== undefined &&
			Number.isFinite(gradePercentageChange) &&
			!notForGrade &&
			!cannotEditPoints &&
			!weightedPointsUnavailable &&
			(hasWeightedPoints || hasOfficialPercentage) &&
			pointsPossible !== undefined &&
			Number.isFinite(pointsPossible) &&
			(pointsPossible > 0 || extraCredit)
	);

	async function recalculateAfterInput() {
		await tick();
		recalculateGradePercentage();
	}
</script>

<Card.Root
	class={[
		'border-border/80 hover:border-foreground/15 max-w-full items-center gap-4 rounded-lg px-[1.125rem] py-[0.875rem] shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.3)] transition-[border-color,background-color,box-shadow,transform] duration-300 hover:-translate-y-px hover:shadow-md sm:flex-row [&_[data-slot=badge]]:h-6',
		showHypotheticalLabel && 'border-primary',
		unseen && 'border-l-grade-strong bg-grade-strong-soft/30 border-l-4'
	]}
>
	<div class="flex flex-1 flex-col gap-[0.46875rem] self-start sm:self-auto">
		<div class="flex flex-wrap items-center gap-1">
			<span class="font-semibold">{name}</span>

			{#if description && !editable}
				<Popover.Root>
					<Popover.Trigger
						class={['ml-1', buttonVariants({ variant: 'outline', size: 'icon' })]}
						title="Assignment description"
					>
						<TextAlignStartIcon />
					</Popover.Trigger>
					<Popover.Content>{description}</Popover.Content>
				</Popover.Root>
			{/if}
		</div>

		<div class="flex flex-wrap gap-1">
			{#if editable && categoryDropdown}
				<select
					aria-label={`Category for ${name}`}
					class="bg-background h-[1.4375rem] max-w-44 rounded-full border px-2 text-[0.6875rem] font-semibold outline-none focus-visible:ring-2"
					style={`border-color:${categorySelectColor};color:${categorySelectColor}`}
					value={categoryDropdownSelected}
					disabled={weightedBasisUnavailable}
					title={weightedBasisUnavailable ? calculationRestriction : undefined}
					onchange={(event) => {
						categoryDropdownSelected = event.currentTarget.value || undefined;
						recalculateGradePercentage();
					}}
				>
					<option value="" disabled>Select category</option>
					{#if categoryDropdownSelected && !categoryDropdown.names.has(categoryDropdownSelected)}
						<option value={categoryDropdownSelected} disabled>{categoryDropdownSelected}</option>
					{/if}
					{#each categoryDropdown.names as dropdownCategory (dropdownCategory)}
						<option value={dropdownCategory}>{dropdownCategory}</option>
					{/each}
				</select>
			{/if}

			{#if categoryBadge}
				<Badge color={categoryBadge.color} outline={true} title="Category">
					{categoryBadge.name}
				</Badge>
			{/if}

			{#if !isGraded}
				<Badge color="yellow" outline={true}>Not Graded</Badge>
			{/if}

			{#if notForGrade}
				<Badge color="pink" outline={true} title="Not calculated in grade">
					{#if editable}
						<Checkbox
							bind:checked={notForGrade}
							disabled={cannotIncludeInGrade}
							title={cannotIncludeInGrade ? calculationRestriction : undefined}
							onchange={recalculateAfterInput}
							id="{id}-not-for-grade"
						/>
						<Label for="{id}-not-for-grade" class="text-xs">Not For Grade</Label>
					{:else}
						Not For Grade
					{/if}
				</Badge>
			{/if}

			{#if extraCredit}
				<Badge
					variant="outline"
					outline={true}
					class="border-grade-extra bg-grade-extra-soft text-grade-extra inline-flex"
					title="Calculated as if zero points were possible"
				>
					{#if editable}
						<Checkbox
							bind:checked={extraCredit}
							disabled={cannotEditPoints}
							title={cannotEditPoints ? calculationRestriction : undefined}
							onchange={recalculateAfterInput}
							id="{id}-extra-credit"
						/>
						<Label for="{id}-extra-credit" class="text-xs">Extra Credit</Label>
					{:else}
						Extra Credit
					{/if}
				</Badge>
			{/if}

			{#if hasRawScore && unscaledPoints}
				<Badge variant="secondary" outline={true}
					>{hasWeightedPoints ? 'Scaled' : 'Raw score'}</Badge
				>
			{/if}

			{#if showHypotheticalLabel}
				<Badge variant="outline" class="border-primary bg-primary/10 text-primary">what-if</Badge>
				{#if onRemove}
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded-full text-lg leading-none"
						title="Remove this what-if"
						aria-label="Remove this what-if"
						onclick={onRemove}>×</button
					>
				{/if}
			{/if}

			{#if date}
				<DateBadge {date} />
			{/if}

			{#if unseen}
				<Badge variant="outline" class="border-grade-strong bg-grade-strong-soft text-grade-strong">
					New
				</Badge>
			{/if}
		</div>
	</div>

	<div class="flex w-full flex-col items-end gap-2 sm:w-auto sm:min-w-[14.375rem]">
		<div class="flex items-center gap-2 font-mono text-sm font-bold">
			{#if comments !== undefined && !editable}
				<Popover.Root>
					<Popover.Trigger
						class={buttonVariants({ variant: 'outline', size: 'icon' })}
						title="Teacher comments"
					>
						<MessageCircleIcon />
					</Popover.Trigger>
					<Popover.Content>{comments}</Popover.Content>
				</Popover.Root>
			{/if}

			{#if showGradePercentageChange}
				{#if gradePercentageChangeRounded < 0}
					<span class="text-grade-risk" title="Overall grade percentage change">
						{formatPercentage(gradePercentageChangeRounded)}%
					</span>
				{:else if gradePercentageChangeRounded > 0}
					<span class="text-grade-strong" title="Overall grade percentage change">
						+{formatPercentage(gradePercentageChangeRounded)}%
					</span>
				{:else if !notForGrade && pointsEarned !== undefined && !isNaN(pointsEarned)}
					<span class="text-grade-neutral" title="Overall grade percentage change">+0%</span>
				{/if}
			{/if}

			{#if hasRawScore && unscaledPoints}
				<span
					class="text-muted-foreground"
					title={hasWeightedPoints ? 'Points before scaling' : 'StudentVUE raw score'}
				>
					({unscaledPoints.pointsEarned}/{unscaledPoints.pointsPossible})
				</span>
			{/if}

			{#if editable}
				<div class="flex w-full items-center justify-end gap-[0.375rem]">
					<NumberInput
						title="Points earned"
						inputmode="decimal"
						step="any"
						class="h-[2.1875rem] w-[3.875rem] px-0 text-center font-mono text-[0.8125rem] sm:h-[1.9375rem] sm:w-[3.25rem]"
						bind:value={pointsEarned}
						disabled={cannotEditPoints}
						oninput={recalculateAfterInput}
					/>
					/
					<NumberInput
						title="Points possible"
						inputmode="decimal"
						step="any"
						class="h-[2.1875rem] w-[3.875rem] px-0 text-center font-mono text-[0.8125rem] sm:h-[1.9375rem] sm:w-[3.25rem]"
						bind:value={pointsPossible}
						disabled={cannotEditPoints}
						oninput={recalculateAfterInput}
					/>
					{#if cannotEditPoints && Number.isFinite(percentage)}
						<span
							class={percentageTextClass}
							title={hasOfficialPercentage
								? 'StudentVUE assignment percentage'
								: 'Assignment grade percentage'}>{formatPercentage(percentage)}%</span
						>
					{/if}
				</div>
			{:else}
				{#if pointsEarned !== undefined}
					<span title="Points earned/Points possible">
						{pointsEarned}/{#if extraCredit}
							<span class="text-grade-extra">{pointsPossible ?? '—'}</span>
						{:else}
							{pointsPossible ?? '—'}
						{/if}
					</span>
				{:else if pointsPossible !== undefined || !isGraded}
					<span title="Points possible">{pointsPossible ?? '—'}</span>
				{/if}
				{#if Number.isFinite(percentage)}
					<span class={percentageTextClass} title="Assignment grade percentage"
						>{formatPercentage(percentage)}%</span
					>
				{/if}
			{/if}
		</div>

		{#if isGraded && calculationIssue === 'category' && !zeroWeightCategory}
			<p class="text-muted-foreground text-xs">Category weight unavailable</p>
		{:else if isGraded && weightedPointsUnavailable}
			<p class="text-muted-foreground text-xs">Weighted points unavailable</p>
		{/if}

		{#if Number.isFinite(percentage)}
			<Progress
				value={progressValue}
				aria-label={`${name} score progress`}
				aria-valuetext={progressValueText}
				class={[
					percentage > 100 ? 'bg-grade-extra-soft' : '',
					'h-1.5 w-full transition-all sm:w-48 lg:w-[14.375rem]'
				]}
				indicatorClass={progressIndicatorClass}
			/>
		{/if}
	</div>
</Card.Root>
