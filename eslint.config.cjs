// ESLint flat config for pulse

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const importPlugin = require('eslint-plugin-import');
const boundariesPlugin = require('eslint-plugin-boundaries');

// Custom project-specific rules
const pulse = {
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
    // Global ignores — exclude build artifacts, caches, and third-party code
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-test-bundle/**',
      '.expo/**',
      '.metro-cache/**',
      'playwright-report/**',
      'data-analytics/**',
      'apps/web/**',
      'packages/*/node_modules/**',
    ],
  },
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
      pulse,
    },
    rules: {
      // Basic recommended TypeScript rules
      ...tsPlugin.configs.recommended.rules,

      // Enforce feature-level file naming for services and utils
      'pulse/file-naming': 'error',

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
  // Architecture boundary enforcement
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { boundaries: boundariesPlugin },
    settings: {
      'boundaries/elements': [
        { type: 'app',       pattern: 'app/**/*' },
        { type: 'feature',   pattern: 'features/**/*' },
        { type: 'lib',       pattern: 'lib/**/*' },
        { type: 'ui',        pattern: 'components/**/*' },
        { type: 'context',   pattern: 'contexts/**/*' },
        { type: 'constants', pattern: 'constants/**/*' },
        { type: 'types',     pattern: 'types/**/*' },
      ],
      'boundaries/ignore': ['**/*.d.ts'],
    },
    rules: {
      // lib must not import from features (prevents inverted dependencies)
      'boundaries/dependencies': ['warn', {
        default: 'allow',
        rules: [
          {
            from: ['lib'],
            disallow: ['feature'],
            message: 'lib/ must not import from features/ — move shared logic to lib/ or invert the dep.',
          },
          {
            from: ['ui'],
            disallow: ['feature'],
            message: 'Shared components/ must not import from features/ — pass data via props instead.',
          },
        ],
      }],
    },
  },
];

