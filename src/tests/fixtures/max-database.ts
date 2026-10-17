import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function createDiagnosticDatabase() {
	const db = new DatabaseSync(':memory:');
	db.exec(
		readFileSync(new URL('../../../migrations/0007_max_diagnostics.sql', import.meta.url), 'utf8')
	);
	return {
		db,
		platform: {
			env: {
				GRADEMAXXING_USAGE_DB: {
					prepare: (sql: string) => {
						let values: (string | number | null)[] = [];
						const statement = {
							bind: (...input: unknown[]) => {
								values = input as typeof values;
								return statement;
							},
							run: async () => ({
								meta: { changes: Number(db.prepare(sql).run(...values).changes) }
							}),
							all: async <T>() => ({ results: db.prepare(sql).all(...values) as T[] })
						};
						return statement;
					}
				}
			}
		}
	};
}
