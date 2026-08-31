<script lang="ts">
	import { brand } from '$lib/brand';
	import AuthPanelHeader from '$lib/components/auth/AuthPanelHeader.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { SvelteURL } from 'svelte/reactivity';
	import { twMerge } from 'tailwind-merge';

	let pastedUrl = $state('');

	const convertedUrl = $derived.by(() => {
		try {
			const url = new SvelteURL(pastedUrl);
			url.pathname = '/PXP2_Password_Help.aspx';
			return url.toString();
		} catch {
			return undefined;
		}
	});
</script>

<AuthPanelHeader backHref="/signup" />

<h1
	class="mb-[1.359375rem] text-[1.4375rem] leading-[2.15625rem] font-bold tracking-[-0.01em]"
	style="font-family: 'Space Grotesk', sans-serif"
>
	Sign up for {brand}
</h1>

<div class="space-y-4 text-[0.875rem] leading-[1.55] text-[#8fa9c2]">
	<p>
		{brand} can't use Sign in with Google to sign you in. You'll need to create a StudentVUE password
		that {brand} can use instead.
	</p>

	<p>You'll still be able to use Sign in with Google with StudentVUE afterwards.</p>

	<Dialog.Root>
		<Dialog.Trigger
			class={twMerge(
				buttonVariants(),
				'flex h-12 w-full items-center justify-center rounded-lg bg-[#4db6f5] font-semibold text-[#081522] hover:bg-[#6fc4f7]'
			)}
		>
			Set your StudentVUE password
		</Dialog.Trigger>

		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Password Reset Help</Dialog.Title>
				<Dialog.Description>
					The exact link to reset your password depends on your district. If you don't know how to
					find it, try these steps:
				</Dialog.Description>
			</Dialog.Header>

			<h4>Find automatically</h4>

			<p class="text-muted-foreground text-sm">
				Paste a link to any page on your district's StudentVUE website and we'll take you to the
				password reset page:
			</p>

			<div class="flex items-center gap-2">
				<Input
					type="url"
					placeholder="https://[your-district]-psv.edupoint.com/Home_PXP2.aspx"
					bind:value={pastedUrl}
				/>
				<Button href={convertedUrl} disabled={convertedUrl === undefined} target="_blank">
					Open
				</Button>
			</div>

			<div class="items-center gap-4 md:flex">
				<div>
					<h4 class="mb-4">Find manually</h4>
					<ol class="text-muted-foreground list-inside list-decimal space-y-4 text-sm">
						<li>
							On your district's StudentVUE website, go to the login page (you may need to
							temporarily log out to get there).
						</li>
						<li>Open the "More Options" dropdown.</li>
						<li>
							Click "Forgot Password". (It does not matter whether you had a password previously.)
						</li>
					</ol>
				</div>

				<img
					src="/password-reset-location.png"
					class="mx-auto mt-4 max-h-96 md:h-48"
					alt="Screenshot of the StudentVUE login page showing the 'Forgot Password' button"
				/>
			</div>
		</Dialog.Content>
	</Dialog.Root>

	<p>
		You should receive an email that will contain a link to set your password.
		<span class="font-bold">This may take a few minutes.</span>
		Once you've created your password, you can
		<a href="/login" class="font-medium text-[#4db6f5] hover:underline">log in</a>.
	</p>
</div>
