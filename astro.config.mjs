import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://automate-ethically.com",
	trailingSlash: "never",
	build: {
		inlineStylesheets: "auto",
	},
	integrations: [sitemap()],
});
