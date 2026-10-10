/** Best-effort isolate budget: two scalars, no address or visitor identifier. */
export class PublicWriteBudget {
	private windowStart = 0;
	private count = 0;
	constructor(
		private readonly maximum = 600,
		private readonly windowMs = 60_000
	) {}

	/** Zero allows a write; otherwise return seconds before another attempt. */
	take(now = Date.now()): number {
		if (now - this.windowStart >= this.windowMs || now < this.windowStart) {
			this.windowStart = now;
			this.count = 0;
		}
		if (this.count >= this.maximum)
			return Math.max(1, Math.ceil((this.windowStart + this.windowMs - now) / 1000));
		this.count++;
		return 0;
	}
}
