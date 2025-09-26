import fs from 'node:fs';

import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const pkgUrl = new URL('./package.json', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgUrl, 'utf-8'));

const input = 'src/index.ts';

export default {
  input,
  output: [
    {
      file: pkg.module,
      format: 'es',
      sourcemap: true
    },
    {
      file: pkg.main,
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    {
      file: pkg.exports['.'].default,
      format: 'iife',
      name: 'Pulse',
      sourcemap: true
    }
  ],
  plugins: [
    resolve({ browser: true }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      compilerOptions: {
        declaration: false,
        declarationDir: undefined,
        outDir: undefined
      }
    }),
    terser({
      format: { comments: false }
    })
  ]
};
