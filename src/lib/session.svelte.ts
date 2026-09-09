export type PortalConnectionState = 'idle' | 'checking' | 'connected' | 'reconnect' | 'offline';

export const portalConnection = $state<{
	state: PortalConnectionState;
	lastVerifiedAt?: number;
	message?: string;
}>({ state: 'idle' });

export function markPortalChecking() {
	if (portalConnection.state !== 'reconnect') portalConnection.state = 'checking';
}

export function markPortalConnected(updatedAt = Date.now()) {
	portalConnection.state = 'connected';
	portalConnection.lastVerifiedAt = updatedAt;
	portalConnection.message = undefined;
}

export function markPortalReconnect(message?: string) {
	portalConnection.state = 'reconnect';
	portalConnection.message = message ?? 'Reconnect to StudentVUE to update your school data.';
}

export function markPortalOffline() {
	if (portalConnection.state !== 'reconnect') portalConnection.state = 'offline';
}

export function resetPortalConnection() {
	portalConnection.state = 'idle';
	portalConnection.lastVerifiedAt = undefined;
	portalConnection.message = undefined;
}
