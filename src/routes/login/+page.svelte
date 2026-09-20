<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LocalStorageKey } from '$lib/storage/keys';
	import { acc, loadStudentAccount, persistStudentAccount } from '$lib/account.svelte';
	import {
		clearStoredCredentials,
		loadStoredCredentials,
		saveStoredCredentials
	} from '$lib/auth/credential-vault';
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
		void goto('/grades');
	}

	let username = $state('');
	let password = $state('');
	let domain = $state(pleasantonDomain);
	let loginError = $state<string | undefined>();
	let loggingIn = $state(false);
	let loginStage = $state('Connecting to StudentVUE…');
	let interactive = $state(false);
	let rememberMe = $state(true);
	const studentVueForgotPasswordUrl = $derived.by(() => {
		try {
			const url = new URL(domain.includes('://') ? domain : `https://${domain}`);
			if (url.protocol !== 'https:') return undefined;
			const directory = url.pathname.endsWith('/')
				? url.pathname
				: /\.[a-z\d]+$/i.test(url.pathname)
					? url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1)
					: `${url.pathname}/`;
			url.pathname = `${directory}PXP2_Password_Help.aspx`;
			url.search = 'S=Y';
			url.hash = '';
			return url.toString();
		} catch {
			return undefined;
		}
	});

	onMount(() => {
		interactive = true;
		void restoreSavedSession();
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

	async function finishLogin(loginAccount: StudentAccount, passwordToStore?: string) {
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
		persistStudentAccount(loginAccount);
		if (rememberMe && passwordToStore) {
			await saveStoredCredentials({
				domain: loginAccount.domain,
				username: loginAccount.userID,
				password: passwordToStore
			});
		} else if (!rememberMe) {
			await clearStoredCredentials();
		}
		acc.studentAccount = loginAccount;
	}

	async function restoreSavedSession() {
		if (loggingIn || acc.studentAccount) return;
		const stored = await loadStoredCredentials();
		if (!stored || localStorage.getItem(LocalStorageKey.token) !== null) return;

		loggingIn = true;
		loginStage = 'Restoring your session…';
		loginError = undefined;
		const savedAccount = new StudentAccount(stored.domain, stored.username, stored.password);
		try {
			await savedAccount.checkLogin();
			await finishLogin(savedAccount, stored.password);
			loginStage = 'Loading your grades…';
			await initializeGradebookCatalog();
			await goto('/grades');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (/invalid|password|credential|unauthor/i.test(message)) await clearStoredCredentials();
			loggingIn = false;
			loginError = 'Your saved StudentVUE sign-in needs attention. Enter your password again.';
		}
	}

	async function login(event: SubmitEvent) {
		event.preventDefault();
		if (loggingIn) return;
		loggingIn = true;
		loginStage = 'Connecting to StudentVUE…';
		loginError = undefined;
		const submittedPassword = password;
		const loginAccount = new StudentAccount(domain, username, submittedPassword);

		try {
			await loginAccount.checkLogin();
		} catch (error) {
			loggingIn = false;
			loginError = error instanceof Error ? error.message : String(error);
			return;
		}

		try {
			await finishLogin(loginAccount, submittedPassword);
		} catch {
			await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
			resetGradebookCatalog();
			resetNonGradeRecords();
			acc.studentAccount = undefined;
			loggingIn = false;
			loginError = `${brand} could not securely save this browser session. Enable site storage and try again.`;
			return;
		}

		loginStage = 'Loading your grades…';
		await initializeGradebookCatalog();
		await goto('/grades');
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
				<Alert.Title>StudentVUE said no.</Alert.Title>
				<Alert.Description>{loginError}</Alert.Description>
			</Alert.Root>
		</div>
	{:else if sessionExpired}
		<div class="fixed top-0 left-0 z-50 flex w-full justify-center p-4">
			<Alert.Root class="w-fit max-w-[calc(100vw-2rem)]">
				<InfoIcon />
				<Alert.Title>The old StudentVUE session expired</Alert.Title>
				<Alert.Description>One more sign-in and we can move on.</Alert.Description>
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
				style="font-family: 'Space Grotesk', sans-serif"
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
					{#if studentVueForgotPasswordUrl}
						<a
							href={studentVueForgotPasswordUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="mt-2 inline-block text-[0.78125rem] font-medium text-[#4db6f5] hover:text-[#79cbf8] hover:underline"
						>
							Forgot password?
						</a>
					{/if}
				</div>

				<label class="flex items-start gap-2 text-[0.78125rem] leading-[1.172rem] text-[#8fa9c2]">
					<input type="checkbox" bind:checked={rememberMe} class="mt-0.5 size-4 accent-[#4db6f5]" />
					<span>
						Keep me signed in on this device
						<span class="block text-xs text-[#7d98b1]"
							>Your password is encrypted locally and sent only over HTTPS when reconnecting.</span
						>
					</span>
				</label>

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
					Your password is encrypted on this device and passed directly to your district when {brand}
					reconnects. We never store it on our servers.
				</p>
				<p class="mt-2.5">{brand} is independent and is not affiliated with Edupoint.</p>
				<p class="mt-[0.875rem] text-xs leading-[1.125rem] text-[#7d98b1]">
					<a href="/privacy" class="text-[#4db6f5] hover:text-[#79cbf8]">Privacy</a>
				</p>
			</div>
		</form>
	</AuthShell>
{/if}
