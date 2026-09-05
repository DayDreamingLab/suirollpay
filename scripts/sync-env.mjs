import { existsSync, copyFileSync } from 'node:fs';
if (existsSync('../.env.local')) copyFileSync('../.env.local', '.env.local');
