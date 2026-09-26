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
	import * as Dialog from '$lib/components/ui/dialog';
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
	let passwordResetOpen = $state(false);
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
		} catch {
			loggingIn = false;
			loginError = 'password-rejected';
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
				<Alert.Title>That password was wrong.</Alert.Title>
				<Alert.Description>Reset it below, then try again.</Alert.Description>
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
			class="border-border bg-card min-h-[41.375rem] w-full max-w-[25rem] rounded-2xl border px-5 pt-[1.5625rem] pb-[0.9375rem] shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.3)] sm:min-h-[42.57rem] sm:p-9"
		>
			<AuthPanelHeader />

			<h1
				class="text-foreground text-[1.4375rem] leading-[2.15625rem] font-bold tracking-[-0.01em]"
				style="font-family: 'Outfit', sans-serif"
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
						class="text-muted-foreground mb-1.5 block text-[0.78125rem] leading-[1.172rem] font-semibold"
					>
						StudentVUE email
					</label>
					<Input
						id="username"
						type="text"
						bind:value={username}
						autocomplete="username"
						class="border-input bg-background text-foreground focus-visible:border-primary focus-visible:outline-primary h-[2.625rem] rounded-[0.5rem] px-3 py-[0.6875rem] text-sm shadow-none focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2"
						disabled={!interactive}
						required
					/>
				</div>

				<div>
					<label
						for="password"
						class="text-muted-foreground mb-1.5 block text-[0.78125rem] leading-[1.172rem] font-semibold"
					>
						StudentVUE password
					</label>
					<Input
						id="password"
						type="password"
						bind:value={password}
						autocomplete="current-password"
						class="border-input bg-background text-foreground focus-visible:border-primary focus-visible:outline-primary h-[2.625rem] rounded-[0.5rem] px-3 py-[0.6875rem] text-sm shadow-none focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2"
						disabled={!interactive}
						required
					/>
					{#if studentVueForgotPasswordUrl}
						<button
							type="button"
							onclick={() => (passwordResetOpen = true)}
							disabled={!interactive}
							class="text-link mt-2 inline-block text-[0.78125rem] font-medium hover:underline hover:brightness-110"
						>
							Forgot password?
						</button>
					{/if}
				</div>

				<label
					class="text-muted-foreground flex items-start gap-2 text-[0.78125rem] leading-[1.172rem]"
				>
					<input type="checkbox" bind:checked={rememberMe} class="accent-primary mt-0.5 size-4" />
					<span>
						Keep me signed in on this device
						<span class="text-tertiary-foreground block text-xs"
							>Your password is encrypted locally and sent only over HTTPS when reconnecting.</span
						>
					</span>
				</label>

				<Button
					type="submit"
					class="border-primary bg-primary text-primary-foreground mt-1.5 h-[2.6875rem] w-full rounded-[0.5rem] border text-[0.90625rem] font-semibold shadow-none transition-none hover:brightness-[1.08]"
					disabled={!interactive || loggingIn}
				>
					{loggingIn ? 'Logging in…' : 'Log in'}
				</Button>
			</div>

			<div
				class="text-muted-foreground mt-[1.125rem] text-center text-[0.8125rem] leading-[1.259375rem]"
			>
				<p>
					Your password is encrypted on this device and passed directly to your district when {brand}
					reconnects. We never store it on our servers.
				</p>
				<p class="mt-2.5">{brand} is independent and is not affiliated with Edupoint.</p>
				<p class="text-tertiary-foreground mt-[0.875rem] text-xs leading-[1.125rem]">
					<a href="/privacy" class="text-link hover:brightness-110">Privacy</a>
				</p>
			</div>
		</form>
	</AuthShell>

	{#if studentVueForgotPasswordUrl}
		<Dialog.Root bind:open={passwordResetOpen}>
			<Dialog.Content
				class="border-border bg-card text-card-foreground shadow-2xl shadow-black/50 sm:max-w-md"
			>
				<Dialog.Header>
					<Dialog.Title>Before you go, check All Mail</Dialog.Title>
					<Dialog.Description class="text-muted-foreground">
						Make sure to click <strong>All Mail</strong> in your school email. The reset message may not
						appear in the main inbox.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer>
					<Button
						variant="outline"
						class="border-input text-foreground hover:border-primary hover:text-foreground bg-transparent hover:bg-transparent"
						onclick={() => (passwordResetOpen = false)}>Not now</Button
					>
					<Button
						href={studentVueForgotPasswordUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="bg-primary text-primary-foreground hover:brightness-110"
						onclick={() => (passwordResetOpen = false)}
					>
						Open StudentVUE password help
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
{/if}
