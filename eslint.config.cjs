// ESLint flat config for q-mobile

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const importPlugin = require('eslint-plugin-import');

// Custom project-specific rules
const qmobile = {
  rules: {
    'file-naming': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Enforce naming conventions for services (*.service.ts) and utils (*.util.ts) under features/',
        },
        schema: [],
      },
      create(context) {
        const filename = context.getFilename();

        // Only enforce within this repo (skip virtual ESLint filenames)
        if (!filename.includes('/features/')) {
          return {};
        }

        const isService = filename.includes('/services/');
        const isUtil = filename.includes('/utils/');

        if (isService && !filename.endsWith('.service.ts')) {
          context.report({
            loc: { line: 1, column: 0 },
            message:
              'Service files under features/*/services/ must be named *.service.ts (e.g. clients.service.ts).',
          });
        }

        if (isUtil && !filename.endsWith('.util.ts')) {
          context.report({
            loc: { line: 1, column: 0 },
            message:
              'Utility files under features/*/utils/ must be named *.util.ts (e.g. totals.util.ts).',
          });
        }

        return {};
      },
    },
  },
};

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
      qmobile,
    },
    rules: {
      // Basic recommended TypeScript rules
      ...tsPlugin.configs.recommended.rules,

      // Enforce feature-level file naming for services and utils
      'qmobile/file-naming': 'error',

      // Enforce architectural dependency direction:
      // app -> features -> lib
      // - features cannot import from app
      // - lib cannot import from app or features
      // - features domains cannot import from other feature domains
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            // features -> app (disallow)
            {
              target: './app',
              from: './features',
            },
            // lib -> app (disallow)
            {
              target: './app',
              from: './lib',
            },
            // lib -> features (disallow)
            {
              target: './features',
              from: './lib',
            },
            // Cross-feature imports (each feature folder blocked from importing others)
            {
              target: './features/clients',
              from: './features',
            },
            {
              target: './features/suppliers',
              from: './features',
            },
            {
              target: './features/vehicles',
              from: './features',
            },
            {
              target: './features/trips',
              from: './features',
            },
            {
              target: './features/finance',
              from: './features',
            },
            {
              target: './features/drivers',
              from: './features',
            },
            {
              target: './features/indents',
              from: './features',
            },
            {
              target: './features/organization',
              from: './features',
            },
            {
              target: './features/auth',
              from: './features',
            },
          ],
        },
      ],
    },
  },
];

