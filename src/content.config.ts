import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const toolkit = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/toolkit" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		// Shown on the page and printed on paper — the same recheck discipline
		// FACTS.md uses, applied to toolkit documents.
		updated: z.date(),
		printable: z.boolean().default(false),
		order: z.number().default(99),
	}),
});

export const collections = { toolkit };
