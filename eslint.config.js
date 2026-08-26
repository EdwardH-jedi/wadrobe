import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// ESLint 9 flat config for a Vite + React + TypeScript project.
export default tseslint.config(
  // `.remember` holds Claude-session scratch files that are git-ignored and
  // absent from a clone; linting them produces failures a clone cannot reproduce.
  { ignores: ['dist', 'node_modules', 'coverage', '.remember', 'eval'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Vercel serverless functions (Edge runtime): Web-standard globals plus
    // `process` for env access; the Fast-Refresh component rule does not apply
    // to a request handler.
    files: ['api/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
