import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://automate-ethically.com",
	trailingSlash: "never",
	build: {
		inlineStylesheets: "auto",
	},
	integrations: [sitemap()],
	// Every page still prerenders to static HTML by default (output: "static"'s
	// behavior is unchanged) — the adapter only exists so the one route that
	// opts out via `export const prerender = false` (src/pages/api/guide.ts)
	// can run on demand. Nothing else about the zero-JS-by-default site
	// changes: this is additive, not a switch to SSR.
	adapter: node({ mode: "standalone" }),
});
