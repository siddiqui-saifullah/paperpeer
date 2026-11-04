// tsc only emits .js, so the build copies the SQL migrations next to the
// compiled database code, where it looks for them.
import fs from 'node:fs';
fs.cpSync('src/db/migrations', 'dist/src/db/migrations', { recursive: true });
