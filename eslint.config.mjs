import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/next-env.d.ts",
      "apps/web/e2e/**",
      "apps/mobile/metro.config.js",
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.expo/**",
      "**/.turbo/**",
      "supabase/.temp/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Client code must never import server-only packages (Node crypto, GitHub App keys, service-role
    // stores). Types are available through the pure `@buildapps/server/types` entry instead.
    files: [
      "apps/mobile/**/*.{ts,tsx}",
      "apps/web/src/components/**/*.{ts,tsx}",
      "apps/web/src/app/(app)/**/*.{ts,tsx}",
      "apps/web/src/app/login/**/*.{ts,tsx}",
      "apps/web/src/app/onboarding/**/*.{ts,tsx}",
      "apps/web/src/lib/session.ts",
      "apps/web/src/lib/api-types.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@buildapps/server",
              message: "Server-only. Use @buildapps/api-client (types: @buildapps/server/types).",
            },
            {
              name: "@buildapps/github",
              message: "Server-only (Node crypto, GitHub App credentials).",
            },
          ],
        },
      ],
    },
  },
);
