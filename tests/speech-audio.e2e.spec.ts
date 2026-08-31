import { expect, test } from "@playwright/test";

/**
 * "The speaking feature is still not emitting noise."
 *
 * A browser under test has no speakers, so nothing here can literally listen.
 * What it can do is watch the last step the page controls: PCM arriving from
 * /api/speech, being decoded into AudioBuffers, and those buffers being
 * started on a running AudioContext. If that happens, the page has done
 * everything it can to make sound; if it does not, no amount of working
 * hardware would have helped.
 *
 * That distinction is what found the bug. The pipeline was fine. Production
 * logs showed GET /api/speech on every guide load and not one POST, because
 * the control that enables it was an 11px uppercase chip reading "voice off",
 * which is a status label wearing a button's clothes. Nobody pressed it, so
 * nothing was ever requested, so nothing ever played.
 */

/** Half a second of a 220Hz tone: real signed 16-bit PCM at the rate the
 *  client expects, so the decode path is exercised rather than stubbed. */
function tonePcm(seconds = 0.5, hz = 220, rate = 24000): Buffer {
	const samples = Math.floor(seconds * rate);
	const buf = Buffer.alloc(samples * 2);
	for (let i = 0; i < samples; i++) {
		buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000), i * 2);
	}
	return buf;
}

const REPLY = "Start at your city council. They meet monthly.";
const SSE =
	`event: phase\ndata: ${JSON.stringify({ phase: "speaking" })}\n\n` +
	`event: text\ndata: ${JSON.stringify({ text: REPLY })}\n\n` +
	`event: done\ndata: ${JSON.stringify({ stopReason: "end_turn" })}\n\n`;

type Harness = { speechPosts: () => number };

/**
 * Counts every AudioBufferSourceNode that actually starts, ignoring the
 * one-sample silent blip unlockAudio() uses to wake Safari.
 */
async function withAudioSpy(page: import("@playwright/test").Page): Promise<Harness> {
	let posts = 0;

	await page.addInitScript(() => {
		const w = window as unknown as { __audioStarts: number };
		w.__audioStarts = 0;
		const start = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args) {
			if (this.buffer && this.buffer.duration > 0.01) w.__audioStarts++;
			return start.apply(this, args as never);
		};
	});

	await page.route("**/api/speech", (route) => {
		if (route.request().method() === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ configured: true }),
			});
		}
		posts++;
		return route.fulfill({
			status: 200,
			headers: { "Content-Type": "audio/L16;rate=24000;channels=1" },
			body: tonePcm(),
		});
	});

	await page.route("**/api/guide", (route) =>
		route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: SSE }),
	);

	return { speechPosts: () => posts };
}

const audioStarts = (page: import("@playwright/test").Page) =>
	page.evaluate(() => (window as unknown as { __audioStarts: number }).__audioStarts);

async function send(page: import("@playwright/test").Page, message: string) {
	await page.locator("#guide-input").fill(message);
	await page.locator("#guide-send").click();
}

test.describe("reading replies aloud", () => {
	test("the control says what pressing it will do", async ({ page }) => {
		await withAudioSpy(page);
		await page.goto("/guide");
		await expect(page.locator("#guide-input")).toBeEnabled({ timeout: 20_000 });

		const voice = page.locator("#guide-voice");
		await expect(voice).toBeVisible({ timeout: 15_000 });

		// The regression: "voice off" names a state, and which state is
		// ambiguous. A visitor cannot tell whether pressing it turns voice on
		// or confirms that it is already off, so they leave it alone.
		const label = ((await voice.textContent()) ?? "").trim();
		expect(label.toLowerCase()).toContain("read");
		expect(label.toLowerCase()).not.toBe("voice off");
		await expect(voice).toHaveAttribute("aria-pressed", "false");
	});

	test("nothing is spoken until a person asks for it", async ({ page }) => {
		const h = await withAudioSpy(page);
		await page.goto("/guide");
		await expect(page.locator("#guide-input")).toBeEnabled({ timeout: 20_000 });

		await send(page, "where do I start?");
		await expect(page.locator(".ae-guide-turn:not(.ae-guide-turn--you)").last()).toContainText(
			"city council",
		);
		await page.waitForTimeout(1200);

		// Browsers refuse to start audio without a gesture, and speaking at
		// someone unasked would be hostile even if they allowed it.
		expect(h.speechPosts(), "asked for audio nobody requested").toBe(0);
		expect(await audioStarts(page)).toBe(0);
	});

	test("turning it on actually produces audio", async ({ page }) => {
		const h = await withAudioSpy(page);
		await page.goto("/guide");
		await expect(page.locator("#guide-input")).toBeEnabled({ timeout: 20_000 });

		// The click is the gesture that unlocks the AudioContext.
		await expect(page.locator("#guide-voice")).toBeVisible({ timeout: 15_000 });
		await page.locator("#guide-voice").click();
		await expect(page.locator("#guide-voice")).toHaveAttribute("aria-pressed", "true");

		await send(page, "where do I start?");
		await expect
			.poll(() => audioStarts(page), {
				message: "no PCM was ever decoded and scheduled: the page made no sound",
				timeout: 10_000,
			})
			.toBeGreaterThan(0);

		expect(h.speechPosts(), "never asked the server for audio").toBeGreaterThan(0);

		// It is scheduled on a context that is actually running, not one left
		// suspended, which is the failure this cannot be allowed to regress to.
		const state = await page.evaluate(() => {
			const AC = window.AudioContext;
			return new AC().state;
		});
		expect(state).toBe("running");
	});

	test("while it is playing, it says so", async ({ page }) => {
		await withAudioSpy(page);
		await page.goto("/guide");
		await expect(page.locator("#guide-input")).toBeEnabled({ timeout: 20_000 });
		await expect(page.locator("#guide-voice")).toBeVisible({ timeout: 15_000 });
		await page.locator("#guide-voice").click();
		await send(page, "where do I start?");

		// Shown from the first scheduled buffer, so the label can only appear
		// when something really is being read aloud.
		await expect(page.locator(".ae-guide-turn-speaking")).toBeVisible({ timeout: 10_000 });
		// And it goes away once the audio has finished.
		await expect(page.locator(".ae-guide-turn-speaking")).toBeHidden({ timeout: 15_000 });
	});

	test("turning it back off stops asking for audio", async ({ page }) => {
		const h = await withAudioSpy(page);
		await page.goto("/guide");
		await expect(page.locator("#guide-input")).toBeEnabled({ timeout: 20_000 });

		const voice = page.locator("#guide-voice");
		await expect(voice).toBeVisible({ timeout: 15_000 });
		await voice.click();
		await send(page, "first");
		await expect.poll(() => audioStarts(page), { timeout: 10_000 }).toBeGreaterThan(0);

		const before = h.speechPosts();
		await voice.click();
		await expect(voice).toHaveAttribute("aria-pressed", "false");

		await send(page, "second");
		await page.waitForTimeout(1500);
		expect(h.speechPosts(), "kept requesting audio after being turned off").toBe(before);
	});
});
