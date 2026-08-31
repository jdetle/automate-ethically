import { getViteConfig } from "astro/config";

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
