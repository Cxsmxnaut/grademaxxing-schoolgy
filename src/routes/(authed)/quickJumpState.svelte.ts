export const quickJumpState = $state({ open: false });

export function toggleQuickJump(force?: boolean) {
	quickJumpState.open = force ?? !quickJumpState.open;
}
