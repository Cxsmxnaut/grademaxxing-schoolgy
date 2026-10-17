import { chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

let platform;
// Called only by the Node adapter's local emulator, never by the Worker.
export async function maxDevelopmentPlatform() {
	if (platform) return platform;
	const { DatabaseSync } = await import('node:sqlite');
	const local = resolve('.local');
	const path = resolve(
		process.env.GRADEMAXXING_MAX_DEV_DATABASE || '.local/max-diagnostics.sqlite'
	);
	if (!path.startsWith(local + sep))
		throw new Error('Max development database must be under .local.');
	mkdirSync(resolve(path, '..'), { recursive: true, mode: 0o700 });
	const db = new DatabaseSync(path);
	chmodSync(path, 0o600);
	if (
		!db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'max_diagnostics'")
			.get()
	) {
		db.exec(
			readFileSync(new URL('../migrations/0007_max_diagnostics.sql', import.meta.url), 'utf8')
		);
	}
	platform = {
		env: {
			GRADEMAXXING_USAGE_DB: {
				prepare(sql) {
					let values = [];
					const statement = {
						bind(...input) {
							values = input;
							return statement;
						},
						async run() {
							return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } };
						},
						async all() {
							return { results: db.prepare(sql).all(...values) };
						}
					};
					return statement;
				}
			}
		}
	};
	return platform;
}
