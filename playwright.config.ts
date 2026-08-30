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
		// Never reuse: the server script builds the site on start, so a
		// leftover server from an earlier run happily serves a stale bundle
		// and the suite silently tests code that is no longer on disk. That
		// wasted real debugging time twice while chasing this bug — a slower,
		// always-fresh start is worth far more than it costs.
		reuseExistingServer: false,
		timeout: 120_000,
		env: { PORT: String(PORT) },
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
