<script lang="ts">
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import AppPageHeader from '$lib/components/AppPageHeader.svelte';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		loadSchedule,
		loadSchoolInfo,
		loadStudentInfo,
		loadStudentProfileFields,
		scheduleState,
		schoolInfoState,
		studentInfoState,
		studentProfileFieldsState
	} from './studentInfo.svelte';
	import CardTitleRow from './CardTitleRow.svelte';
	import { attendanceState, loadAttendance } from '../attendance/attendance.svelte';
	import { toast } from 'svelte-sonner';
	import {
		ArrowUpRight,
		BadgeCheck,
		CalendarDays,
		Clock,
		Copy,
		DoorOpen,
		ExternalLink,
		GraduationCap,
		Info,
		Landmark,
		MapPin,
		Phone,
		ShieldCheck,
		User
	} from '@lucide/svelte';

	loadStudentInfo();
	loadStudentProfileFields();
	loadSchedule();
	loadSchoolInfo();
	loadAttendance();

	const now = Date.now();

	const schoolDayStart = 7 * 60;
	const schoolDayEnd = 16 * 60;

	const nowMinutes = $derived.by(() => {
		const date = new Date(now);
		return date.getHours() * 60 + date.getMinutes();
	});
	const isSchoolDay = $derived(
		nowMinutes >= schoolDayStart && nowMinutes <= schoolDayEnd && new Date(now).getDay() >= 1
	);

	function toMinutes(time: unknown) {
		if (typeof time !== 'string') return null;
		const match = time.match(/^(\d{1,2}):(\d{2})/);
		return match ? Number(match[1]) * 60 + Number(match[2]) : null;
	}

	const upcomingClasses = $derived.by(() => {
		const classes = (scheduleState.data?.classes ?? []).filter(
			(entry) => entry.startTime && entry.endTime
		);
		if (classes.length === 0) return [];
		if (!isSchoolDay) return classes.slice(0, 3);
		const sorted = [...classes].sort(
			(a, b) => (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0)
		);
		const currentIndex = sorted.findIndex((entry) => {
			const start = toMinutes(entry.startTime);
			const end = toMinutes(entry.endTime);
			return start !== null && end !== null && nowMinutes >= start && nowMinutes < end;
		});
		if (currentIndex === -1) return sorted.slice(0, 3);
		return sorted.slice(currentIndex, currentIndex + 3);
	});

	const attendanceTotals = $derived.by(() => {
		const readTotal = (group: { PeriodTotal?: Array<{ _Total: string }> | null } | undefined) => {
			const total = (group?.PeriodTotal ?? []).reduce(
				(sum, entry) => sum + (Number(entry._Total) || 0),
				0
			);
			return Number.isFinite(total) && total > 0 ? total : undefined;
		};
		return {
			absences: readTotal(attendanceState.data?.TotalUnexcused),
			tardies: readTotal(attendanceState.data?.TotalTardies),
			excused: readTotal(attendanceState.data?.TotalExcused)
		};
	});

	const hasAttendanceTotals = $derived(
		attendanceTotals.absences !== undefined ||
			attendanceTotals.tardies !== undefined ||
			attendanceTotals.excused !== undefined
	);

	const schoolWebsiteUrl = $derived.by(() => {
		const raw = schoolInfoState.data?.website;
		if (typeof raw !== 'string' || !raw.trim()) return undefined;
		return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
	});

	const schoolMapsUrl = $derived.by(() => {
		const address = schoolInfoState.data?.address;
		if (typeof address !== 'string' || !address.trim()) return undefined;
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
	});

	function formatClassTime(start: unknown, end: unknown) {
		const format = (time: unknown) => {
			const minutes = toMinutes(time);
			if (minutes === null) return typeof time === 'string' ? time : '';
			const date = new Date();
			date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		};
		return `${format(start)} – ${format(end)}`;
	}

	function classPeriodLabel(period: string) {
		const match = period.match(/\d+/);
		return match ? `Period ${match[0]}` : period || 'Class';
	}

	function copyText(value: string, label: string) {
		navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied`));
	}

	const profileRows = $derived(
		Object.entries(studentProfileFieldsState.data ?? {}).filter(
			([key, value]) =>
				!/^(?:student name|name|perm id|grade|gender|photo)$/i.test(key) && value.trim().length > 0
		)
	);
</script>

<svelte:head>
	<title>Student Info - {brand}</title>
</svelte:head>

<AppPageShell>
	<AppPageHeader
		eyebrow="Student profile"
		title="Student information"
		description="Your school identity, today's classes, and locally cached app data."
	/>

	{#if !studentInfoState.loaded && !studentInfoState.data}
		<div class="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
			<div class="space-y-5">
				<Card.Root>
					<Card.Content class="flex flex-col gap-5 px-5 py-6 sm:flex-row sm:items-center sm:px-7">
						<Skeleton class="size-24 shrink-0 rounded-full" />
						<div class="space-y-2.5">
							<Skeleton class="h-7 w-48" />
							<Skeleton class="h-4 w-32" />
							<Skeleton class="h-4 w-40" />
						</div>
					</Card.Content>
				</Card.Root>
				<Card.Root>
					<Card.Content class="px-5 py-6 sm:px-7">
						<Skeleton class="h-5 w-40" />
						<div class="mt-5 space-y-4">
							{#each Array(3) as _, i (i)}
								<div class="flex items-center gap-4">
									<Skeleton class="size-9 rounded-lg" />
									<div class="flex-1 space-y-1.5">
										<Skeleton class="h-4 w-2/5" />
										<Skeleton class="h-3 w-1/4" />
									</div>
									<Skeleton class="h-3 w-20" />
								</div>
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
			</div>
			<div class="space-y-5">
				<Card.Root>
					<Card.Content class="px-5 py-6 sm:px-7">
						<Skeleton class="h-5 w-36" />
						<div class="mt-5 space-y-3">
							{#each Array(3) as _, i (i)}
								<Skeleton class="h-4 w-full" />
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
				<Card.Root>
					<Card.Content class="px-5 py-6 sm:px-7">
						<Skeleton class="h-5 w-44" />
						<div class="mt-5 space-y-3">
							{#each Array(4) as _, i (i)}
								<Skeleton class="h-4 w-full" />
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
			</div>
		</div>
	{:else if studentInfoState.refreshing}
		<LoadingBanner>Refreshing student info.</LoadingBanner>
	{/if}

	{#if studentInfoState.error}
		<RecordLoadFailure
			label="student information"
			error={studentInfoState.error}
			refreshing={studentInfoState.refreshing}
			retry={() => {
				loadStudentInfo(true);
				loadStudentProfileFields(true);
			}}
		/>
	{/if}

	{#if studentInfoState.data}
		<div class="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
			<div class="space-y-5">
				<Card.Root class="overflow-hidden">
					<div
						class="from-primary/8 flex flex-col gap-5 bg-gradient-to-br to-transparent px-5 py-6 sm:flex-row sm:items-center sm:px-7"
					>
						{#if studentInfoState.data.Photo}
							<img
								src="data:{studentInfoState.data.PhotoMimeType ||
									'image/png'};base64,{studentInfoState.data.Photo}"
								class="bg-background ring-card size-24 shrink-0 rounded-full object-cover p-0.5 ring-4"
								alt="Student Portrait"
							/>
						{:else}
							<div
								class="bg-primary/10 text-primary ring-card flex size-24 shrink-0 items-center justify-center rounded-full text-3xl font-bold ring-4"
								aria-label="Student portrait unavailable"
							>
								{studentInfoState.data.FormattedName.trim().charAt(0) || '?'}
							</div>
						{/if}
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<h2
									class="font-heading truncate text-2xl font-bold tracking-[-0.02em] sm:text-[1.75rem]"
								>
									{studentInfoState.data.FormattedName}
								</h2>
								<BadgeCheck
									class="text-primary size-5 shrink-0"
									aria-label="Connected student account"
								/>
							</div>
							<div class="mt-2.5 flex flex-wrap items-center gap-1.5">
								<Badge variant="secondary" class="gap-1">
									<GraduationCap class="size-3" />
									{studentInfoState.data.Grade === null
										? 'Grade unavailable'
										: `Grade ${studentInfoState.data.Grade}`}
								</Badge>
								{#if schoolInfoState.data?.name}
									<Badge variant="secondary" class="gap-1">
										<Landmark class="size-3" />
										{schoolInfoState.data.name}
									</Badge>
								{/if}
								{#if studentInfoState.data.Gender}
									<Badge variant="outline" class="gap-1">
										<User class="size-3" />
										{studentInfoState.data.Gender}
									</Badge>
								{/if}
							</div>
							<p class="text-muted-foreground mt-2.5 font-mono text-xs tracking-wide">
								{studentInfoState.data.PermID === null
									? 'Student ID unavailable'
									: `Student ID ${studentInfoState.data.PermID}`}
							</p>
						</div>
					</div>
				</Card.Root>

				{#if upcomingClasses.length > 0}
					<Card.Root>
						<Card.Header class="px-5 sm:px-7">
							<CardTitleRow title="Today" meta={scheduleState.data?.date}>
								{#snippet icon()}
									<CalendarDays class="text-primary size-4" />
								{/snippet}
							</CardTitleRow>
						</Card.Header>
						<Card.Content class="px-5 sm:px-7">
							<ul class="space-y-1.5">
								{#each upcomingClasses as entry (entry.period + entry.courseTitle)}
									{@const start = toMinutes(entry.startTime)}
									{@const end = toMinutes(entry.endTime)}
									{@const ongoing =
										isSchoolDay &&
										start !== null &&
										end !== null &&
										nowMinutes >= start &&
										nowMinutes < end}
									<li
										class="border-border/60 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-4"
										class:border-l-2={ongoing}
										class:border-l-emerald-500={ongoing}
									>
										<div class="flex min-w-0 flex-1 items-center gap-3">
											<Badge
												variant="secondary"
												class={ongoing
													? 'w-fit shrink-0 bg-emerald-100 font-mono text-[0.6875rem] dark:bg-emerald-900/60'
													: 'w-fit shrink-0 font-mono text-[0.6875rem]'}
											>
												{classPeriodLabel(entry.period)}
											</Badge>
											<span class="truncate text-sm font-medium">{entry.courseTitle}</span>
											{#if ongoing}
												<Badge class="shrink-0 bg-emerald-600 text-[0.6875rem] text-white"
													>Now</Badge
												>
											{/if}
										</div>
										<div class="text-muted-foreground flex shrink-0 items-center gap-3.5 text-xs">
											{#if entry.room}
												<span class="inline-flex items-center gap-1">
													<DoorOpen class="size-3" />
													{entry.room}
												</span>
											{/if}
											<span class="inline-flex items-center gap-1 tabular-nums">
												<Clock class="size-3" />
												{formatClassTime(entry.startTime, entry.endTime)}
											</span>
										</div>
									</li>
								{/each}
							</ul>
						</Card.Content>
						<Card.Footer class="border-border/60 border-t px-5 pt-4 sm:px-7">
							<a
								href="/attendance"
								class="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
							>
								Full attendance overview
								<ArrowUpRight class="size-3.5" />
							</a>
						</Card.Footer>
					</Card.Root>
				{:else if hasAttendanceTotals}
					<Card.Root>
						<Card.Header class="px-5 sm:px-7">
							<CardTitleRow title="Attendance">
								{#snippet icon()}
									<CalendarDays class="text-primary size-4" />
								{/snippet}
							</CardTitleRow>
						</Card.Header>
						<Card.Content class="px-5 sm:px-7">
							<div class="grid grid-cols-3 gap-3 text-center">
								<div class="border-border/60 rounded-lg border p-3">
									<p class="text-2xl font-bold tabular-nums">{attendanceTotals.absences ?? '—'}</p>
									<p class="text-muted-foreground mt-0.5 text-xs">Absences</p>
								</div>
								<div class="border-border/60 rounded-lg border p-3">
									<p class="text-2xl font-bold tabular-nums">{attendanceTotals.tardies ?? '—'}</p>
									<p class="text-muted-foreground mt-0.5 text-xs">Tardies</p>
								</div>
								<div class="border-border/60 rounded-lg border p-3">
									<p class="text-2xl font-bold tabular-nums">{attendanceTotals.excused ?? '—'}</p>
									<p class="text-muted-foreground mt-0.5 text-xs">Excused</p>
								</div>
							</div>
						</Card.Content>
						<Card.Footer class="border-border/60 border-t px-5 pt-4 sm:px-7">
							<a
								href="/attendance"
								class="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
							>
								Full attendance overview
								<ArrowUpRight class="size-3.5" />
							</a>
						</Card.Footer>
					</Card.Root>
				{/if}

				<Card.Root>
					<Card.Header class="px-5 sm:px-7">
						<CardTitleRow title="Student Information">
							{#snippet icon()}
								<Info class="text-primary size-4" />
							{/snippet}
						</CardTitleRow>
					</Card.Header>
					<Card.Content class="px-5 sm:px-7">
						<dl class="grid grid-cols-2 gap-3 sm:grid-cols-3">
							<div class="border-border/60 rounded-lg border p-3">
								<dt class="text-muted-foreground text-xs">Student ID</dt>
								<dd class="mt-1 text-sm font-semibold tabular-nums">
									{studentInfoState.data.PermID ?? 'Unavailable'}
								</dd>
							</div>
							<div class="border-border/60 rounded-lg border p-3">
								<dt class="text-muted-foreground text-xs">Grade</dt>
								<dd class="mt-1 text-sm font-semibold">
									{studentInfoState.data.Grade ?? 'Unavailable'}
								</dd>
							</div>
							{#if studentInfoState.data.Gender}
								<div class="border-border/60 rounded-lg border p-3">
									<dt class="text-muted-foreground text-xs">Gender</dt>
									<dd class="mt-1 text-sm font-semibold">{studentInfoState.data.Gender}</dd>
								</div>
							{/if}
						</dl>

						{#if !studentProfileFieldsState.loaded && !studentProfileFieldsState.data}
							<div class="mt-5 space-y-3 border-t pt-5">
								{#each Array(2) as _, i (i)}
									<Skeleton class="h-4 w-3/5" />
								{/each}
							</div>
						{:else if profileRows.length > 0}
							<dl
								class="border-border/60 mt-5 max-h-96 space-y-3.5 overflow-y-auto border-t pt-5 text-sm"
							>
								{#each profileRows as [label, value] (label)}
									<div class="flex items-start justify-between gap-6">
										<dt class="text-muted-foreground shrink-0">{label}</dt>
										<dd class="min-w-0 text-right font-medium break-words">{value}</dd>
									</div>
								{/each}
							</dl>
						{/if}
					</Card.Content>
				</Card.Root>
			</div>

			<div class="space-y-5">
				{#if !schoolInfoState.error}
					{#if schoolInfoState.data}
						<Card.Root>
							<Card.Header class="px-5 sm:px-7">
								<CardTitleRow title={schoolInfoState.data.name || 'School information'}>
									{#snippet icon()}
										<Landmark class="text-primary size-4" />
									{/snippet}
								</CardTitleRow>
							</Card.Header>
							<Card.Content class="px-5 sm:px-7">
								<ul class="space-y-3 text-sm">
									{#if schoolInfoState.data.address}
										<li>
											<a
												href={schoolMapsUrl}
												target="_blank"
												rel="noreferrer"
												class="group flex items-start gap-2.5"
											>
												<MapPin
													class="text-muted-foreground group-hover:text-primary mt-0.5 size-4 shrink-0 transition-colors"
												/>
												<span class="group-hover:text-primary leading-snug transition-colors">
													{schoolInfoState.data.address}
												</span>
											</a>
										</li>
									{/if}
									{#if schoolInfoState.data.phone}
										<li>
											<a
												href="tel:{schoolInfoState.data.phone}"
												class="group flex items-center gap-2.5"
											>
												<Phone
													class="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-colors"
												/>
												<span class="group-hover:text-primary transition-colors">
													{schoolInfoState.data.phone}
												</span>
											</a>
										</li>
									{/if}
									{#if schoolWebsiteUrl}
										<li>
											<a
												href={schoolWebsiteUrl}
												target="_blank"
												rel="noreferrer"
												class="group flex items-center gap-2.5"
											>
												<ExternalLink
													class="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-colors"
												/>
												<span class="group-hover:text-primary transition-colors">
													{schoolInfoState.data.website.replace(/^https?:\/\//, '')}
												</span>
											</a>
										</li>
									{/if}
									{#if schoolInfoState.data.principal}
										<li class="text-muted-foreground flex items-center gap-2.5">
											<User class="size-4 shrink-0" />
											<span>Principal · {schoolInfoState.data.principal}</span>
										</li>
									{/if}
								</ul>
							</Card.Content>
						</Card.Root>
					{:else if !schoolInfoState.loaded}
						<Card.Root>
							<Card.Content class="px-5 py-6 sm:px-7">
								<Skeleton class="h-5 w-36" />
								<div class="mt-5 space-y-3">
									{#each Array(3) as _, i (i)}
										<Skeleton class="h-4 w-full" />
									{/each}
								</div>
							</Card.Content>
						</Card.Root>
					{/if}
				{/if}

				{#if acc.studentAccount}
					<Card.Root>
						<Card.Header class="px-5 sm:px-7">
							<CardTitleRow title="Login Information">
								{#snippet icon()}
									<ShieldCheck class="text-success size-4" />
								{/snippet}
							</CardTitleRow>
						</Card.Header>
						<Card.Content class="px-5 sm:px-7">
							<ul class="divide-border/60 divide-y text-sm">
								<li class="flex items-center justify-between gap-3 py-2.5 first:pt-0">
									<span class="text-muted-foreground shrink-0">Username</span>
									<span class="flex min-w-0 items-center gap-1.5 font-medium">
										<span class="truncate">{acc.studentAccount.userID}</span>
										<Button
											onclick={() => copyText(acc.studentAccount!.userID, 'Username')}
											variant="ghost"
											size="icon-sm"
											title="Copy username"
										>
											<Copy />
										</Button>
									</span>
								</li>
								<li class="flex items-center justify-between gap-3 py-2.5">
									<span class="text-muted-foreground shrink-0">Password</span>
									<span class="text-success font-medium">Encrypted on this device</span>
								</li>
								<li class="flex items-center justify-between gap-3 py-2.5">
									<span class="text-muted-foreground shrink-0">Password retention</span>
									<span class="text-muted-foreground font-medium">Not stored</span>
								</li>
								<li class="flex items-center justify-between gap-3 py-2.5 last:pb-0">
									<span class="text-muted-foreground shrink-0">District portal</span>
									<span class="flex min-w-0 items-center gap-1.5 font-medium">
										<span class="truncate">{acc.studentAccount.domain}</span>
										<Button
											onclick={() => copyText(acc.studentAccount!.domain, 'Portal address')}
											variant="ghost"
											size="icon-sm"
											title="Copy domain"
										>
											<Copy />
										</Button>
									</span>
								</li>
							</ul>
						</Card.Content>
					</Card.Root>
				{/if}
			</div>
		</div>
	{/if}
</AppPageShell>
