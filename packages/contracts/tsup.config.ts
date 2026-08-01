import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/v1/index.ts'],
  format: ['esm', 'cjs'],
  clean: true,
  sourcemap: true,
  splitting: false,
  dts: false,
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.mjs' };
  },
});
