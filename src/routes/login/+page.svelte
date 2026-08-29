<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LocalStorageKey } from '$lib';
	import { acc, loadStudentAccount } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import AuthPanelHeader from '$lib/components/auth/AuthPanelHeader.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import DistrictCombobox from '$lib/components/auth/DistrictCombobox.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { DISTRICTS, type StudentVueDistrict } from '$lib/data/districts';
	import { resetGradebookCatalog } from '$lib/grades/catalog.svelte';
	import { seenAssignmentIDs } from '$lib/grades/seenAssignments.svelte';
	import { StudentAccount } from '$lib/synergy';
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import InfoIcon from '@lucide/svelte/icons/info';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { resetNonGradeRecords } from '../(authed)/resetNonGradeRecords.svelte';

	const pleasantonDomain = 'https://ca-pleas-psv.edupoint.com';

	if (browser && localStorage.getItem(LocalStorageKey.token) !== null) {
		if (!acc.studentAccount) loadStudentAccount();
		void goto('/dashboard');
	}

	let username = $state('');
	let password = $state('');
	let domain = $state(pleasantonDomain);
	let districtExpanded = $state(false);
	let hydrated = $state(false);
	let loginError = $state<string | undefined>();
	let loggingIn = $state(false);

	const sessionExpired = $derived(
		browser && page.url.searchParams.get('sessionExpired') === 'true'
	);
	const districtName = $derived(
		normalizedDistrictTarget(domain) === 'ca-pleas-psv.edupoint.com'
			? 'Pleasanton USD'
			: (DISTRICTS.find((district) => district.domain === normalizedDistrictTarget(domain))?.name ??
					'Custom district')
	);

	onMount(() => {
		hydrated = true;
	});

	function normalizedDistrictTarget(value: string) {
		try {
			const url = new URL(value.includes('://') ? value : `https://${value}`);
			const path = url.pathname.replace(/^\/+|\/+$/g, '');
			return `${url.host.toLowerCase()}${path ? `/${path.toLowerCase()}` : ''}`;
		} catch {
			return '';
		}
	}

	function toggleDistrict() {
		districtExpanded = !districtExpanded;
	}

	function selectDistrict(district: StudentVueDistrict) {
		domain = `https://${district.domain}`;
	}

	async function gradebookOwnerFingerprint(user: string, district: string) {
		const identity = `${district.trim().toLowerCase()}\n${user.trim().toLowerCase()}`;
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
		return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
			''
		);
	}

	async function login(event: SubmitEvent) {
		event.preventDefault();
		if (loggingIn) return;
		loggingIn = true;
		loginError = undefined;
		const loginAccount = new StudentAccount(domain, username, password);

		try {
			await loginAccount.checkLogin();
		} catch (error) {
			loggingIn = false;
			loginError = error instanceof Error ? error.message : String(error);
			return;
		}

		try {
			resetGradebookCatalog();
			resetNonGradeRecords();
			const ownerFingerprint = await gradebookOwnerFingerprint(
				loginAccount.userID,
				loginAccount.domain
			);
			let sameStudent = localStorage.getItem(LocalStorageKey.gradebookOwner) === ownerFingerprint;
			const previousToken = localStorage.getItem(LocalStorageKey.token);
			if (!sameStudent && previousToken !== null) {
				try {
					const previous = JSON.parse(previousToken) as { username?: unknown; domain?: unknown };
					sameStudent =
						typeof previous.username === 'string' &&
						typeof previous.domain === 'string' &&
						previous.username.toLowerCase() === loginAccount.userID.toLowerCase() &&
						previous.domain.toLowerCase() === loginAccount.domain.toLowerCase();
				} catch {
					/* Invalid identity metadata never authorizes cache reuse. */
				}
			}

			if (!sameStudent) {
				seenAssignmentIDs.clear();
				for (const key of [
					LocalStorageKey.gradebook,
					LocalStorageKey.seenAssignmentIDs,
					LocalStorageKey.attendance,
					LocalStorageKey.documents,
					LocalStorageKey.mailData,
					LocalStorageKey.studentInfo
				])
					localStorage.removeItem(key);
			}
			localStorage.setItem(LocalStorageKey.gradebookOwner, ownerFingerprint);
			localStorage.setItem(
				LocalStorageKey.token,
				JSON.stringify({
					username: loginAccount.userID,
					domain: loginAccount.domain,
					sessionId: loginAccount.sessionId
				})
			);
			acc.studentAccount = loginAccount;
		} catch {
			await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
			resetGradebookCatalog();
			resetNonGradeRecords();
			acc.studentAccount = undefined;
			loggingIn = false;
			loginError =
				'Grademaxxing could not securely save this browser session. Enable site storage and try again.';
			return;
		}

		loggingIn = false;
		void goto('/dashboard');
	}
</script>

<svelte:head><title>Sign In - {brand}</title></svelte:head>

{#if loggingIn}<LoadingBanner>Logging you in...</LoadingBanner>{/if}
{#if loginError}
	<div
		in:fly={{ y: -50, duration: 200 }}
		class="fixed top-0 left-0 z-50 flex w-full justify-center p-4"
	>
		<Alert.Root variant="destructive" class="w-fit max-w-[calc(100vw-2rem)]"
			><AlertCircleIcon /><Alert.Title>Couldn't log in</Alert.Title><Alert.Description
				>{loginError}</Alert.Description
			></Alert.Root
		>
	</div>
{/if}
{#if sessionExpired && !loginError}
	<div class="fixed top-0 left-0 z-50 flex w-full justify-center p-4">
		<Alert.Root class="w-fit max-w-[calc(100vw-2rem)]"
			><InfoIcon /><Alert.Title>Your StudentVUE session expired</Alert.Title><Alert.Description
				>Sign in again to reconnect and refresh your school data.</Alert.Description
			></Alert.Root
		>
	</div>
{/if}

<AuthShell promo>
	<form
		onsubmit={login}
		class="w-full max-w-[25rem] rounded-[1.25rem] border border-[#203a51] bg-[#0d2335] p-6 shadow-2xl shadow-black/20 sm:p-8"
	>
		<AuthPanelHeader />
		<h2 class="text-[1.65rem] leading-tight font-bold tracking-[-0.035em]">Sign in to {brand}</h2>

		<div class="mt-8 space-y-5">
			<div>
				<p class="mb-2 text-sm font-semibold text-[#91aac2]">School district</p>
				<div class="flex h-12 items-center rounded-xl border border-[#42aff0] bg-[#183650] px-4">
					<strong class="min-w-0 truncate text-[#55baf3]">{districtName}</strong>
					<button
						type="button"
						onclick={toggleDistrict}
						disabled={!hydrated}
						class="ml-auto text-sm font-semibold text-[#9bb2c8] underline underline-offset-2 hover:text-white disabled:cursor-wait disabled:opacity-60"
						aria-expanded={districtExpanded}>{districtExpanded ? 'Done' : 'Change'}</button
					>
				</div>
			</div>

			{#if districtExpanded}
				<div class="space-y-5">
					<DistrictCombobox value={domain} onselect={selectDistrict} />
					<div>
						<label for="domain" class="mb-2 block text-sm font-semibold text-[#91aac2]"
							>Or enter a district portal URL</label
						>
						<Input
							id="domain"
							type="text"
							inputmode="url"
							aria-label="StudentVUE Domain"
							bind:value={domain}
							placeholder="https://your-district-psv.edupoint.com"
							autocapitalize="off"
							autocorrect="off"
							required
							class="h-12 rounded-xl border-[#294258] bg-[#071522] px-4 text-base text-[#e4eef8]"
						/>
					</div>
				</div>
			{/if}

			<div>
				<label for="username" class="mb-2 block text-sm font-semibold text-[#91aac2]"
					>StudentVue email</label
				>
				<Input
					id="username"
					type="text"
					aria-label="StudentVUE Username"
					bind:value={username}
					autocomplete="username"
					required
					class="h-12 rounded-xl border-[#294258] bg-[#071522] px-4 text-base text-[#e4eef8]"
				/>
			</div>
			<div>
				<label for="password" class="mb-2 block text-sm font-semibold text-[#91aac2]"
					>StudentVue password</label
				>
				<Input
					id="password"
					type="password"
					aria-label="StudentVUE Password"
					bind:value={password}
					autocomplete="current-password"
					required
					class="h-12 rounded-xl border-[#294258] bg-[#071522] px-4 text-base text-[#e4eef8]"
				/>
			</div>

			<Button
				type="submit"
				disabled={loggingIn}
				class="h-12 w-full rounded-xl bg-[#4db6f5] text-base font-bold text-[#06131f] hover:bg-[#68c4f8]"
				>{loggingIn ? 'Signing in…' : 'Log in'}</Button
			>
		</div>

		<div class="mt-6 space-y-3 text-center text-sm leading-5 text-[#91aac2]">
			<p>
				Your password is sent over encrypted HTTPS, used only to open StudentVUE, and never stored.
			</p>
			<p>
				Never used a StudentVUE password before? <a
					href="/signup"
					class="font-semibold text-[#55baf3] underline underline-offset-2">Create one.</a
				>
			</p>
			<p class="text-xs leading-4 text-[#718ba3]">
				Independent from Edupoint · <a
					href="/privacy"
					class="text-[#55baf3] underline underline-offset-2">Privacy</a
				>
			</p>
		</div>
	</form>
</AuthShell>
