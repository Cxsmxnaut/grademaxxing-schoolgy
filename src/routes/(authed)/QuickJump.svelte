<script lang="ts">
	import { goto } from '$app/navigation';
	import { computeCommandScore } from 'bits-ui';
	import { brandName } from '$lib/brand';
	import * as Command from '$lib/components/ui/command';
	import type { StudentDocumentData } from '$lib/contracts/studentvue/documents';
	import type { InboxItemListingsMessageXML } from '$lib/contracts/studentvue/mail';
	import { gradebookState } from '$lib/grades/catalog.svelte';
	import { removeCourseType } from '$lib/grades/course-name';
	import { getActiveGradebook } from '$lib/grades/gradebook';
	import BookIcon from '@lucide/svelte/icons/book';
	import CalendarCheck2Icon from '@lucide/svelte/icons/calendar-check-2';
	import FilesIcon from '@lucide/svelte/icons/files';
	import MailOpenIcon from '@lucide/svelte/icons/mail-open';
	import MessageSquareQuoteIcon from '@lucide/svelte/icons/message-square-quote';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';
	import type { Component } from 'svelte';
	import { documentsState, loadDocuments } from './documents/documents.svelte';
	import { loadMailData, mailDataState } from './mail/mailData.svelte';
	import {
		quickJumpRecents,
		recordQuickJump,
		type QuickJumpTarget,
		type QuickJumpTargetKind
	} from './quickJumpRecents.svelte';
	import { quickJumpState } from './quickJumpState.svelte';

	// Items carry a hidden unique suffix after this separator so rows that share
	// a label (a recent and its page, two sections of one class) stay distinct
	// to the command list. `paletteFilter` scores only the visible part.
	const valueSeparator = '\u0000';

	function paletteFilter(value: string, search: string, keywords?: string[]): number {
		const [label] = value.split(valueSeparator);
		return computeCommandScore(label ?? value, search, keywords);
	}

	function itemValue(label: string, id: string) {
		return `${label}${valueSeparator}${id}`;
	}

	const pages: { title: string; url: string; icon: Component; keywords: string }[] = [
		{
			title: 'Gradebook',
			url: '/grades',
			icon: BookIcon,
			keywords: 'grades classes assignments marks'
		},
		{
			title: 'Attendance',
			url: '/attendance',
			icon: CalendarCheck2Icon,
			keywords: 'absences tardies calendar school day'
		},
		{
			title: 'Documents',
			url: '/documents',
			icon: FilesIcon,
			keywords: 'files report cards library'
		},
		{
			title: 'Mail',
			url: '/mail',
			icon: MailOpenIcon,
			keywords: 'inbox messages studentvue email'
		},
		{
			title: 'Student information',
			url: '/studentinfo',
			icon: UserRoundIcon,
			keywords: 'profile account student id schedule school'
		},
		{
			title: 'Feedback',
			url: '/feedback',
			icon: MessageSquareQuoteIcon,
			keywords: 'support contact help'
		}
	];

	let search = $state('');

	function run(target: QuickJumpTarget) {
		quickJumpState.open = false;
		recordQuickJump(target);
		void goto(target.url);
	}

	const courses = $derived.by(() => {
		// The version read keeps this derived when the catalog swaps report periods.
		gradebookState.version;
		return getActiveGradebook()?.Courses.Course;
	});

	const messages = $derived.by(() => {
		const listing = mailDataState.data?.InboxItemListings.MessageXML;
		return (Array.isArray(listing) ? listing : []).slice(0, 15);
	});

	const documents = $derived.by(() => {
		const listing = documentsState.data?.StudentDocumentDatas.StudentDocumentData;
		return Array.isArray(listing) ? listing : ([] as StudentDocumentData[]);
	});

	// Mail and documents load on demand elsewhere; warm them while the palette
	// is open so the first query already has something to search. Each open
	// starts from an empty query instead of the previous search.
	$effect(() => {
		if (!quickJumpState.open) return;
		search = '';
		void loadMailData();
		void loadDocuments();
	});

	function mailSender(message: InboxItemListingsMessageXML): string {
		return message.From.RecipientXML._Details1 ?? '';
	}

	function textSnippet(html: string): string {
		return html
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 200);
	}

	function iconForTarget(kind: QuickJumpTargetKind, url: string): Component {
		switch (kind) {
			case 'class':
				return BookIcon;
			case 'mail':
				return MailOpenIcon;
			case 'document':
				return FilesIcon;
			default:
				return pages.find((page) => page.url === url)?.icon ?? BookIcon;
		}
	}

	type HighlightPart = { text: string; hit: boolean };

	// Greedy first-match subsequence highlight, mirroring how the fuzzy scorer
	// finds characters in order, so the visible marks line up with ranking.
	function highlight(text: string, query: string): HighlightPart[] {
		const needle = query.trim().toLocaleLowerCase();
		if (!needle) return [{ text, hit: false }];
		const parts: HighlightPart[] = [];
		let index = 0;
		let buffer = '';
		let bufferHit = false;
		for (const char of text) {
			const hit = index < needle.length && char.toLocaleLowerCase() === needle[index];
			if (hit) index++;
			if (buffer && hit !== bufferHit) {
				parts.push({ text: buffer, hit: bufferHit });
				buffer = '';
			}
			buffer += char;
			bufferHit = hit;
		}
		if (buffer) parts.push({ text: buffer, hit: bufferHit });
		return parts;
	}

	$effect(() => {
		const handler = (event: KeyboardEvent) => {
			if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				quickJumpState.open = !quickJumpState.open;
			}
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	});
</script>

{#snippet result(icon: Component, title: string, subtitle: string)}
	{@const Icon = icon}
	<Icon class="size-4 shrink-0 opacity-70" />
	<span class="flex min-w-0 flex-col">
		<span class="truncate">
			{#each highlight(title, search) as part, index (index)}
				{#if part.hit}
					<span class="font-semibold underline underline-offset-2">{part.text}</span>
				{:else}
					{part.text}
				{/if}
			{/each}
		</span>
		{#if subtitle}
			<span class="text-muted-foreground truncate text-xs">{subtitle}</span>
		{/if}
	</span>
{/snippet}

<Command.Dialog
	bind:open={quickJumpState.open}
	title="Quick jump"
	description="{brandName} pages and classes"
	filter={paletteFilter}
>
	<Command.Input placeholder="Search pages and classes…" bind:value={search} autofocus />
	<Command.List>
		<Command.Empty class="px-4 py-8">
			<p class="font-medium">No results for “{search.trim()}”.</p>
			<p class="text-muted-foreground mt-1 text-xs">
				Search covers pages, classes, documents, and mail.
			</p>
		</Command.Empty>

		{#if !search.trim() && quickJumpRecents.length > 0}
			<Command.Group heading="Recent">
				{#each quickJumpRecents as recent (recent.url)}
					<Command.Item
						value={itemValue(recent.title, `recent:${recent.url}`)}
						keywords={[recent.subtitle]}
						onSelect={() => run(recent)}
						class="[&_svg:last-child]:hidden"
					>
						{@render result(iconForTarget(recent.kind, recent.url), recent.title, recent.subtitle)}
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}

		<Command.Group heading="Pages">
			{#each pages as item (item.url)}
				<Command.Item
					value={itemValue(item.title, `page:${item.url}`)}
					keywords={[item.keywords]}
					onSelect={() => run({ title: item.title, subtitle: '', url: item.url, kind: 'page' })}
					class="[&_svg:last-child]:hidden"
				>
					{@render result(item.icon, item.title, '')}
				</Command.Item>
			{/each}
		</Command.Group>

		{#if courses && courses.length > 0}
			<Command.Group heading="Classes">
				{#each courses as course (course._CourseID)}
					{@const title = removeCourseType(course._CourseName)}
					{@const subtitle = [
						`Period ${course._Period}`,
						course._Staff,
						course._Room ? `Room ${course._Room}` : ''
					]
						.filter(Boolean)
						.join(' · ')}
					<Command.Item
						value={itemValue(title, `class:${course._CourseID}`)}
						keywords={[
							course._CourseID,
							`period ${course._Period}`,
							course._Staff ?? '',
							course._Room ?? '',
							`room ${course._Room ?? ''}`
						]}
						onSelect={() =>
							run({
								title,
								subtitle,
								url: `/grades/${encodeURIComponent(course._CourseID)}`,
								kind: 'class'
							})}
						class="[&_svg:last-child]:hidden"
					>
						{@render result(BookIcon, title, subtitle)}
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}

		{#if documents.length > 0}
			<Command.Group heading="Documents">
				{#each documents as document (document._DocumentGU)}
					{@const title = document._DocumentFileName || document._DocumentType || 'Document'}
					{@const subtitle = [document._DocumentType, document._DocumentDate]
						.filter(Boolean)
						.join(' · ')}
					<Command.Item
						value={itemValue(title, `doc:${document._DocumentGU}`)}
						keywords={[
							document._DocumentType ?? '',
							document._DocumentDate ?? '',
							document._DocumentComment ?? ''
						]}
						onSelect={() =>
							run({
								title,
								subtitle,
								url: `/documents/document?documentGU=${encodeURIComponent(document._DocumentGU)}`,
								kind: 'document'
							})}
						class="[&_svg:last-child]:hidden"
					>
						{@render result(FilesIcon, title, subtitle)}
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}

		{#if messages.length > 0}
			<Command.Group heading="Mail">
				{#each messages as message (message._SMMsgPersonGU || message._SMMessageGU)}
					{@const title = message._Subject || '(no subject)'}
					{@const subtitle = [mailSender(message), message._SendDateTimeFormattedShort]
						.filter(Boolean)
						.join(' · ')}
					<Command.Item
						value={itemValue(title, `mail:${message._SMMsgPersonGU || message._SMMessageGU}`)}
						keywords={[mailSender(message), textSnippet(message._MessageText)]}
						onSelect={() =>
							run({
								title,
								subtitle,
								url: `/mail?messageGU=${encodeURIComponent(
									message._SMMsgPersonGU || message._SMMessageGU
								)}`,
								kind: 'mail'
							})}
						class="[&_svg:last-child]:hidden"
					>
						{@render result(MailOpenIcon, title, subtitle)}
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
	<div
		class="text-muted-foreground -mx-1 mt-1 -mb-1 flex items-center gap-3 border-t px-3 py-2 text-xs"
	>
		<span class="flex items-center gap-1">
			<kbd class="bg-muted rounded px-1 py-px font-mono text-[0.625rem]">↑</kbd>
			<kbd class="bg-muted rounded px-1 py-px font-mono text-[0.625rem]">↓</kbd>
			Navigate
		</span>
		<span class="flex items-center gap-1">
			<kbd class="bg-muted rounded px-1 py-px font-mono text-[0.625rem]">↵</kbd>
			Open
		</span>
		<span class="flex items-center gap-1">
			<kbd class="bg-muted rounded px-1 py-px font-mono text-[0.625rem]">esc</kbd>
			Close
		</span>
	</div>
</Command.Dialog>
