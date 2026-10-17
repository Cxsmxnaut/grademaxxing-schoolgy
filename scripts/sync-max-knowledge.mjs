import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
// Explicit public implementation guides only. Never read env files, private
// handoffs, session state, logs or authenticated content into this bundle.
const ids = ['docs/studentvue-integration.md', 'docs/design-system.md'];
const guides = ids.map((id) => ({ id, content: readFileSync(new URL(id, root), 'utf8') }));
const destination = fileURLToPath(new URL('src/lib/server/max/app-guides.json', root));
const source = JSON.stringify(guides, null, String.fromCharCode(9)) + String.fromCharCode(10);
let previous = '';
try {
	previous = readFileSync(destination, 'utf8');
} catch {
	/* Initial generation. */
}
if (previous !== source) writeFileSync(destination, source);
