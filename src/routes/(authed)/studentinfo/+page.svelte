<script lang="ts">
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import AppPageHeader from '$lib/components/AppPageHeader.svelte';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import { Button } from '$lib/components/ui/button';
	import BadgeCheckIcon from '@lucide/svelte/icons/badge-check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { loadStudentInfo, studentInfoState } from './studentInfo.svelte';

	loadStudentInfo();

	function copyUsername() {
		if (!acc.studentAccount) return;
		navigator.clipboard.writeText(acc.studentAccount.userID);
	}
	function copyDomain() {
		if (!acc.studentAccount) return;
		navigator.clipboard.writeText(acc.studentAccount.domain);
	}
</script>

<svelte:head>
	<title>Student Info - {brand}</title>
</svelte:head>

<AppPageShell>
	<AppPageHeader
		eyebrow="Student profile"
		title="Student information"
		description="Your school identity, account connection, and locally cached app data."
	/>

	{#if !studentInfoState.loaded && !studentInfoState.data}
		<LoadingBanner>Loading student info.</LoadingBanner>
	{:else if studentInfoState.refreshing}
		<LoadingBanner>Refreshing student info.</LoadingBanner>
	{/if}

	{#if studentInfoState.error}
		<RecordLoadFailure
			label="student information"
			error={studentInfoState.error}
			refreshing={studentInfoState.refreshing}
			retry={() => loadStudentInfo(true)}
		/>
	{/if}

	{#if studentInfoState.data}
		<section
			class="bg-card mt-5 overflow-hidden rounded-xl shadow-sm"
			aria-labelledby="student-name"
		>
			<div class="bg-primary/6 flex flex-col gap-5 px-5 py-6 sm:flex-row sm:items-center sm:px-7">
				{#if studentInfoState.data.Photo}
					<img
						src="data:{studentInfoState.data.PhotoMimeType || 'image/png'};base64,{studentInfoState
							.data.Photo}"
						class="ring-card size-20 shrink-0 rounded-full object-cover ring-4"
						alt="Student portrait"
					/>
				{:else}
					<div
						class="bg-primary/12 text-primary ring-card flex size-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold ring-4"
						aria-label="Student portrait unavailable"
					>
						{studentInfoState.data.FormattedName.trim().charAt(0) || '?'}
					</div>
				{/if}

				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<h2 id="student-name" class="truncate text-2xl font-bold tracking-tight">
							{studentInfoState.data.FormattedName}
						</h2>
						<BadgeCheckIcon class="text-primary size-5" aria-label="Connected student account" />
					</div>
					<p class="text-muted-foreground mt-1 text-sm">
						{studentInfoState.data.Grade === null
							? 'Grade level unavailable'
							: `Grade ${studentInfoState.data.Grade}`}
						{#if studentInfoState.data.PermID !== null}
							· Student ID {studentInfoState.data.PermID}
						{/if}
					</p>
				</div>
			</div>

			<div class="grid gap-0 sm:grid-cols-2">
				<div class="border-border/70 p-5 sm:border-r sm:p-6">
					<h3 class="text-muted-foreground text-xs font-bold tracking-[0.12em] uppercase">
						School profile
					</h3>
					<dl class="mt-4 space-y-3 text-sm">
						<div class="flex items-center justify-between gap-4">
							<dt class="text-muted-foreground">Student ID</dt>
							<dd class="font-medium tabular-nums">
								{studentInfoState.data.PermID ?? 'Unavailable'}
							</dd>
						</div>
						<div class="flex items-center justify-between gap-4">
							<dt class="text-muted-foreground">Grade</dt>
							<dd class="font-medium">{studentInfoState.data.Grade ?? 'Unavailable'}</dd>
						</div>
						{#if studentInfoState.data.Gender}
							<div class="flex items-center justify-between gap-4">
								<dt class="text-muted-foreground">Gender</dt>
								<dd class="font-medium">{studentInfoState.data.Gender}</dd>
							</div>
						{/if}
					</dl>
				</div>

				{#if acc.studentAccount}
					<div class="border-border/70 border-t p-5 sm:border-t-0 sm:p-6">
						<div class="flex items-center gap-2">
							<ShieldCheckIcon class="text-success size-4" />
							<h3 class="text-muted-foreground text-xs font-bold tracking-[0.12em] uppercase">
								Secure connection
							</h3>
						</div>
						<dl class="mt-4 space-y-3 text-sm">
							<div class="flex items-center justify-between gap-4">
								<dt class="text-muted-foreground">Username</dt>
								<dd class="flex min-w-0 items-center gap-2 font-medium">
									<span class="truncate">{acc.studentAccount.userID}</span>
									<Button
										onclick={copyUsername}
										variant="ghost"
										size="icon-sm"
										title="Copy username"
									>
										<CopyIcon />
									</Button>
								</dd>
							</div>
							<div class="flex items-center justify-between gap-4">
								<dt class="text-muted-foreground">Password</dt>
								<dd class="text-success font-medium">Encrypted on this device</dd>
							</div>
							<div class="flex items-center justify-between gap-4">
								<dt class="text-muted-foreground">District portal</dt>
								<dd class="flex min-w-0 items-center gap-2 font-medium">
									<span class="truncate">{acc.studentAccount.domain}</span>
									<Button onclick={copyDomain} variant="ghost" size="icon-sm" title="Copy domain">
										<CopyIcon />
									</Button>
								</dd>
							</div>
						</dl>
					</div>
				{/if}
			</div>
		</section>
	{/if}
</AppPageShell>
