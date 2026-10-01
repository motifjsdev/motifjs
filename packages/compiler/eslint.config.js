import js from '@eslint/js';
import globals from 'globals';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
    { ignores: ['dist/**'] },
    js.configs.recommended,
    ...tsPlugin.configs['flat/recommended'],
    {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node,
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-inferrable-types': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            'no-var': 'off',
            'prefer-const': 'off',
            'no-empty': 'off',
            'no-useless-catch': 'off',
            'no-extra-semi': 'off',
            'no-console': 'off',
        },
    },
];
