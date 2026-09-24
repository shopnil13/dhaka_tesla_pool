import { defineConfig } from 'tsup';

// Bundle the API into dist/. npm dependencies stay external (installed in the
// image); the workspace package @teslapool/shared ships as TypeScript source,
// so it is compiled into the bundle.
export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  noExternal: ['@teslapool/shared'],
  sourcemap: true,
  clean: true,
});
