import js from '@eslint/js'
import globals from 'globals'

/*
|--------------------------------------------------------------------------
| Server lint config
|--------------------------------------------------------------------------
|
| The server had no linting at all — no config, no script, eslint not
| even installed. `node --check` was the only gate, and it catches
| nothing beyond parse errors: not an undefined variable, not an unused
| import, and not a duplicate object key.
|
| That last one mattered. models/InventoryItem.js declared `code` twice
| with DIFFERENT definitions, so JavaScript kept the second and silently
| discarded a `unique: true` from the first. A parser is perfectly happy
| with that; a linter catches it immediately.
|
| Deliberately narrow: correctness rules only, no style opinions. The
| goal is catching bugs, not reformatting 29 route files.
*/
export default [
  {
    ignores: ['node_modules/**', 'uploads/**', 'reports/**', 'templates/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
    },
    rules: {
      /*
       * `args: 'none'` because Express hands every handler
       * (req, res, next) whether or not the body uses all three — and
       * the error middleware MUST declare all four parameters to be
       * recognised as error-handling at all. Flagging those would be
       * noise about a required signature.
       *
       * ignoreRestSiblings covers `const { password, ...safe } = user`,
       * where the omitted key is the entire point.
       */
      'no-unused-vars': [
        'error',
        {
          args: 'none',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Silent data loss: the later key wins and the earlier one
      // vanishes. This is what hid the InventoryItem.code bug.
      'no-dupe-keys': 'error',

      'no-console': 'off', // the server logs to stdout by design
    },
  },
  {
    // Tests get the vitest globals.
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2023 },
    },
  },
]
