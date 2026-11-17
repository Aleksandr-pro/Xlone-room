import { build } from 'esbuild';

await Promise.all([
  build({
    entryPoints: ['src/worker.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: 'dist/worker.js',
    minify: true,
    sourcemap: false,
  }),
  build({
    entryPoints: ['src/stdio.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/stdio.js',
    minify: false,
    sourcemap: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
  }),
]);

console.log('Built apps/xl3d-mcp/dist/worker.js and dist/stdio.js');
