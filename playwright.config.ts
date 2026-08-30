import { defineConfig, devices } from "@playwright/test";

const PORT = 4322;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: "./tests",
	fullyParallel: false,
	retries: 0,
	reporter: "list",
	use: {
		baseURL: BASE_URL,
		trace: "retain-on-failure",
	},
	webServer: {
		// See scripts/e2e-server.sh for why this uses Cloudflare's test
		// Turnstile keys, never the real production widget.
		command: "bash scripts/e2e-server.sh",
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		env: { PORT: String(PORT) },
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
