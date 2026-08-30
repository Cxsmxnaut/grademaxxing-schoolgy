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
	import PostLoginLoadingScreen from '$lib/components/auth/PostLoginLoadingScreen.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { initializeGradebookCatalog, resetGradebookCatalog } from '$lib/grades/catalog.svelte';
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
	let loginError = $state<string | undefined>();
	let loggingIn = $state(false);
	let loginStage = $state('Connecting to StudentVUE…');
	let interactive = $state(false);

	onMount(() => {
		interactive = true;
	});

	const sessionExpired = $derived(
		browser && page.url.searchParams.get('sessionExpired') === 'true'
	);

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
		loginStage = 'Connecting to StudentVUE…';
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

		loginStage = 'Loading your grades…';
		await initializeGradebookCatalog();
		await goto('/dashboard');
	}
</script>

<svelte:head>
	<title>Log In - {brand}</title>
</svelte:head>

{#if loggingIn}
	<PostLoginLoadingScreen message={loginStage} />
{:else}
	{#if loginError}
		<div
			in:fly={{ y: -50, duration: 200 }}
			class="fixed top-0 left-0 z-50 flex w-full justify-center p-4"
		>
			<Alert.Root variant="destructive" class="w-fit max-w-[calc(100vw-2rem)]">
				<AlertCircleIcon />
				<Alert.Title>Couldn't log in</Alert.Title>
				<Alert.Description>{loginError}</Alert.Description>
			</Alert.Root>
		</div>
	{:else if sessionExpired}
		<div class="fixed top-0 left-0 z-50 flex w-full justify-center p-4">
			<Alert.Root class="w-fit max-w-[calc(100vw-2rem)]">
				<InfoIcon />
				<Alert.Title>Your StudentVUE session expired</Alert.Title>
				<Alert.Description
					>Sign in again to reconnect and refresh your school data.</Alert.Description
				>
			</Alert.Root>
		</div>
	{/if}

	<AuthShell promo>
		<form
			onsubmit={login}
			class="min-h-[41.375rem] w-full max-w-[25rem] rounded-2xl border border-[rgba(228,238,248,0.08)] bg-[#0d2033] px-5 pt-[1.5625rem] pb-[0.9375rem] shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.3)] sm:min-h-[42.57rem] sm:p-9"
		>
			<AuthPanelHeader />

			<h1
				class="text-[1.4375rem] leading-[2.15625rem] font-bold tracking-[-0.01em] text-[#e4eef8]"
				style="font-family: 'Space Grotesk Variable', sans-serif"
			>
				Sign in to {brand}
			</h1>

			<div class="mt-[1.359375rem] space-y-[1.125rem]">
				<DistrictCombobox
					value={domain}
					onselect={(district) => (domain = `https://${district.domain}`)}
					onvalueinput={(value) => (domain = value)}
					disabled={!interactive}
				/>

				<div>
					<label
						for="username"
						class="mb-1.5 block text-[0.78125rem] leading-[1.172rem] font-semibold text-[#8fa9c2]"
					>
						StudentVUE email
					</label>
					<Input
						id="username"
						type="text"
						bind:value={username}
						autocomplete="username"
						class="h-[2.625rem] rounded-[0.5rem] border-[rgba(228,238,248,0.16)] bg-[#081522] px-3 py-[0.6875rem] text-sm text-[#e4eef8] shadow-none focus-visible:border-[#4db6f5] focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4db6f5]"
						disabled={!interactive}
						required
					/>
				</div>

				<div>
					<label
						for="password"
						class="mb-1.5 block text-[0.78125rem] leading-[1.172rem] font-semibold text-[#8fa9c2]"
					>
						StudentVUE password
					</label>
					<Input
						id="password"
						type="password"
						bind:value={password}
						autocomplete="current-password"
						class="h-[2.625rem] rounded-[0.5rem] border-[rgba(228,238,248,0.16)] bg-[#081522] px-3 py-[0.6875rem] text-sm text-[#e4eef8] shadow-none focus-visible:border-[#4db6f5] focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4db6f5]"
						disabled={!interactive}
						required
					/>
				</div>

				<Button
					type="submit"
					class="mt-1.5 h-[2.6875rem] w-full rounded-[0.5rem] border border-[#4db6f5] bg-[#4db6f5] text-[0.90625rem] font-semibold text-[#06131f] shadow-none transition-none hover:brightness-[1.08]"
					disabled={!interactive || loggingIn}
				>
					{loggingIn ? 'Logging in…' : 'Log in'}
				</Button>
			</div>

			<div class="mt-[1.125rem] text-center text-[0.8125rem] leading-[1.259375rem] text-[#8fa9c2]">
				<p>
					Your password is encrypted in transit and passed directly to your district. We never store
					it, and we never save your grades.
				</p>
				<p class="mt-2.5">
					{brand} is independent and is not affiliated with Edupoint. If you have never used a StudentVUE
					password, you may need to
					<a href="/signup" class="font-medium text-[#4db6f5] hover:text-[#79cbf8]">create one</a>.
				</p>
				<p class="mt-[0.875rem] text-xs leading-[1.125rem] text-[#7d98b1]">
					<a href="/privacy" class="text-[#4db6f5] hover:text-[#79cbf8]">Privacy</a>
				</p>
			</div>
		</form>
	</AuthShell>
{/if}
