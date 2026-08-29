import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://automate-ethically.com",
	trailingSlash: "never",
	build: {
		inlineStylesheets: "auto",
	},
});
