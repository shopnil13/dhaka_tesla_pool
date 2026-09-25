import { defineConfig } from 'tsup';

// Bundle the API into dist/. npm dependencies stay external (installed in the
// image); the workspace package @teslapool/shared ships as TypeScript source,
// so it is compiled into the bundle. migrate and seed are separate entries so
// the production image can run them without tsx.
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    migrate: 'src/db/migrate.ts',
    seed: 'src/db/seed.ts',
  },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  noExternal: ['@teslapool/shared'],
  sourcemap: true,
  clean: true,
});
