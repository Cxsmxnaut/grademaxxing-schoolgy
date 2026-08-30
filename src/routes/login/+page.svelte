<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LocalStorageKey } from '$lib';
	import { acc, loadStudentAccount } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import AuthPanelHeader from '$lib/components/auth/AuthPanelHeader.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import DistrictCombobox from '$lib/components/auth/DistrictCombobox.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
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
		void goto('/grades');
	}

	let username = $state('');
	let password = $state('');
	let domain = $state(pleasantonDomain);
	let loginError = $state<string | undefined>();
	let loggingIn = $state(false);
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
		void goto('/grades');
	}
</script>

<svelte:head>
	<title>Log In - {brand}</title>
</svelte:head>

{#if loggingIn}
	<LoadingBanner>Logging you in...</LoadingBanner>
{/if}

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
			<Alert.Description>Sign in again to reconnect and refresh your school data.</Alert.Description
			>
		</Alert.Root>
	</div>
{/if}

<AuthShell promo>
	<form
		onsubmit={login}
		class="w-full max-w-[25rem] rounded-[1.35rem] border border-[#294258] bg-[#0b2133] px-7 py-8 shadow-[0_28px_80px_rgba(0,0,0,0.28)] sm:px-8"
	>
		<AuthPanelHeader />

		<h1
			class="font-display text-[1.75rem] leading-tight font-bold tracking-[-0.035em] text-[#e4eef8]"
		>
			Sign in to {brand}
		</h1>

		<div class="mt-8 space-y-5">
			<DistrictCombobox
				value={domain}
				onselect={(district) => (domain = `https://${district.domain}`)}
				onvalueinput={(value) => (domain = value)}
				disabled={!interactive}
			/>

			<div>
				<label for="username" class="mb-2 block text-sm font-semibold text-[#91aac2]">
					StudentVUE email
				</label>
				<Input
					id="username"
					type="text"
					bind:value={username}
					placeholder="student@school.net"
					autocomplete="username"
					class="h-12 rounded-xl border-[#294258] bg-[#071522] px-4 text-base text-[#e4eef8] shadow-none placeholder:text-[#68839c] focus-visible:border-[#55baf3] focus-visible:ring-[#55baf3]/25"
					disabled={!interactive}
					required
				/>
			</div>

			<div>
				<label for="password" class="mb-2 block text-sm font-semibold text-[#91aac2]">
					StudentVUE password
				</label>
				<Input
					id="password"
					type="password"
					bind:value={password}
					autocomplete="current-password"
					class="h-12 rounded-xl border-[#294258] bg-[#071522] px-4 text-base text-[#e4eef8] shadow-none focus-visible:border-[#55baf3] focus-visible:ring-[#55baf3]/25"
					disabled={!interactive}
					required
				/>
			</div>

			<label class="flex items-start gap-3 text-xs leading-5 text-[#7893ab]" for="disclaimer">
				<Checkbox
					name="disclaimer"
					id="disclaimer"
					class="mt-0.5 border-[#456078] bg-[#071522] data-[state=checked]:border-[#4db6f5] data-[state=checked]:bg-[#4db6f5]"
					disabled={!interactive}
					required
				/>
				<span>
					I understand that {brand} is an independent tool and is not affiliated with Edupoint.
				</span>
			</label>

			<Button
				type="submit"
				class="h-12 w-full rounded-xl bg-[#4db6f5] font-bold text-[#06131f] shadow-none transition-none hover:bg-[#69c4f7]"
				disabled={!interactive || loggingIn}
			>
				{loggingIn ? 'Logging in…' : 'Log in'}
			</Button>
		</div>

		<div class="mt-6 space-y-4 text-center text-sm leading-5 text-[#91aac2]">
			<p>
				Your password travels over encrypted HTTPS, is used only to open StudentVUE, and is never
				stored.
			</p>
			<p>
				Need a StudentVUE password?
				<a href="/signup" class="font-medium text-[#4db6f5] hover:text-[#79cbf8]">Get started</a>
			</p>
			<a href="/privacy" class="inline-block text-[#4db6f5] hover:text-[#79cbf8]">Privacy</a>
		</div>
	</form>
</AuthShell>
