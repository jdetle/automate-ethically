import { expect, test } from "@playwright/test";
import { readSecret, readSecretDetailed } from "../src/lib/env";

// Guards the exact production outage this module was written for: API keys
// copied out of a quoted .env line (KEY="sk-ant-…") carried their quote
// characters into the secret store, so every request was rejected with
// `invalid x-api-key` while every "is it configured?" check still passed.

test.describe("readSecret", () => {
	const NAME = "AE_TEST_SECRET";

	test.afterEach(() => {
		delete process.env[NAME];
	});

	test("strips surrounding double quotes — the actual outage", () => {
		process.env[NAME] = '"sk-ant-abc123"';
		expect(readSecret(NAME)).toBe("sk-ant-abc123");
		expect(readSecretDetailed(NAME).repaired).toBe(true);
	});

	test("strips surrounding single quotes", () => {
		process.env[NAME] = "'sk-ant-abc123'";
		expect(readSecret(NAME)).toBe("sk-ant-abc123");
	});

	test("strips whitespace and trailing newlines", () => {
		process.env[NAME] = "  sk-ant-abc123\n";
		expect(readSecret(NAME)).toBe("sk-ant-abc123");
		expect(readSecretDetailed(NAME).repaired).toBe(true);
	});

	test("strips quotes that also carry whitespace", () => {
		process.env[NAME] = '  " sk-ant-abc123 "  ';
		expect(readSecret(NAME)).toBe("sk-ant-abc123");
	});

	test("leaves a clean value untouched and reports no repair", () => {
		process.env[NAME] = "sk-ant-abc123";
		const result = readSecretDetailed(NAME);
		expect(result.value).toBe("sk-ant-abc123");
		expect(result.repaired).toBe(false);
	});

	test("does not strip unmatched or interior quotes", () => {
		process.env[NAME] = '"sk-ant-abc123';
		expect(readSecret(NAME)).toBe('"sk-ant-abc123');
		process.env[NAME] = 'sk-"ant"-abc';
		expect(readSecret(NAME)).toBe('sk-"ant"-abc');
	});

	test("strips only one layer, so a genuinely quoted value survives", () => {
		process.env[NAME] = '""quoted""';
		expect(readSecret(NAME)).toBe('"quoted"');
	});

	test("returns empty string when unset", () => {
		expect(readSecret(NAME)).toBe("");
		expect(readSecretDetailed(NAME).repaired).toBe(false);
	});
});
