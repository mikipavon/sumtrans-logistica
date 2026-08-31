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
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Lo inyecta Vite en build (ver vite.config.js): la versión con la que se
        // compiló, para poder saber con cuál falló un móvil.
        __APP_VERSION__: 'readonly',
        __APP_BUILD_DATE__: 'readonly',
        __APP_BUILD_NUMBER__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Los ficheros de configuración se ejecutan en Node, no en el navegador: ahí sí
    // existen process, __dirname y compañía.
    files: ['*.config.js', 'vite.config.js', 'vitest.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
