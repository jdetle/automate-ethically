/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// The reference above pulls in Vitest's `test` key; getViteConfig returns a
// Vite UserConfig, which on its own does not know about it, and `astro check`
// type-errors on the file without it.
//
// getViteConfig loads the real astro.config.mjs, so component tests run
// through the same Vite pipeline (and the same aliases, integrations and
// content-collection setup) that builds the site. A component that renders
// here renders in production.
export default getViteConfig({
	test: {
		include: ["tests/unit/**/*.spec.ts"],
		environment: "node",
	},
});
