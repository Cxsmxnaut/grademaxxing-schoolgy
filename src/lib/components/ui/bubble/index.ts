import Content from './bubble-content.svelte';
import Group from './bubble-group.svelte';
import Reactions, {
	bubbleReactionsVariants,
	type BubbleReactionsAlign,
	type BubbleReactionsSide
} from './bubble-reactions.svelte';
import Root, { bubbleVariants, type BubbleVariant } from './bubble.svelte';

export {
	//
	Root as Bubble,
	Content as BubbleContent,
	Group as BubbleGroup,
	Reactions as BubbleReactions,
	bubbleReactionsVariants,
	bubbleVariants,
	Content,
	Group,
	Reactions,
	Root,
	type BubbleReactionsAlign,
	type BubbleReactionsSide,
	type BubbleVariant
};
