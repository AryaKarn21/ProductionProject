import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      /*
       * Recognise two idioms this codebase uses correctly, which the
       * default settings flag as unused variables.
       *
       * ignoreRestSiblings — omitting keys by destructuring them next
       * to a rest element:
       *
       *     const { page, limit, ...filters } = params
       *
       * `page` and `limit` exist precisely so they do NOT end up in
       * `filters`. "Fixing" that by deleting them would silently leak
       * pagination into the filter payload. Same idiom in
       * EmployeeEdit's `const { employeeId: _eid, ...payload }`.
       *
       * The ignore patterns cover the conventional throwaway binding,
       * e.g. `.filter(([_, value]) => value)`, where only the second
       * element is wanted.
       */
      'no-unused-vars': [
        'error',
        {
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      /*
       * Downgraded to a warning — deliberately, and this is a
       * reclassification of known debt, NOT a claim that it is fixed.
       *
       * 16 places sync external data into local state from an effect:
       * populating a form once its record loads, selecting a default
       * email account once accounts arrive, resetting a filter input
       * when the parent clears it. React now discourages the pattern in
       * favour of deriving during render or remounting via `key`.
       *
       * Every one of the 16 was checked individually: all have a
       * dependency array, and the self-referencing ones are guarded by
       * an early return (`if (form.accountId) return`), so none loops
       * and none is a live bug. Rewriting fourteen working forms to
       * satisfy a stylistic rule is a regression risk with no
       * functional gain.
       *
       * Kept visible as a warning so new code does not add more, and so
       * these can be migrated when those components are next touched
       * for other reasons.
       */
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
