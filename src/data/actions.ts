/**
 * Every way in, in one list.
 *
 * This is the single source for the action matcher and for the ladder on
 * /act, so the two can never drift apart. Two rules hold here:
 *
 *  - `time` is the honest cost, not the marketing cost. If we cannot state a
 *    price for an action, the action is not ready to be asked for.
 *  - `accountable: true` marks an action where a named person answers for the
 *    outcome. It is the only thing on the site permitted to wear gold.
 */

/** Time buckets, cheapest first. The matcher filters on these, not on prose. */
export type Bucket = "b1" | "b2" | "b3" | "b4" | "b5" | "b6";

/** What the visitor brings. `any` actions surface under every audience. */
export type Audience = "any" | "neighbor" | "writer" | "developer" | "lawyer" | "automated";

export interface Action {
	title: string;
	/** Human-readable cost, shown on the time chip verbatim. */
	time: string;
	bucket: Bucket;
	audience: Audience;
	/** Label for the role chip. */
	tag: string;
	body: string;
	href: string;
	/** A named person answers for this one. Renders the gold rail. */
	accountable?: boolean;
}

export const AUDIENCES: { value: Audience; label: string }[] = [
	{ value: "any", label: "Anyone" },
	{ value: "neighbor", label: "A neighbor" },
	{ value: "writer", label: "A writer" },
	{ value: "developer", label: "A developer" },
	{ value: "lawyer", label: "A lawyer" },
	{ value: "automated", label: "My job is being automated" },
];

/** `keeps` is the set of buckets a time filter leaves visible. */
export const TIMES: { value: string; label: string; keeps: Bucket[] }[] = [
	{ value: "any", label: "Any", keeps: ["b1", "b2", "b3", "b4", "b5", "b6"] },
	{ value: "q5", label: "5 minutes or less", keeps: ["b1", "b2", "b3"] },
	{ value: "h1", label: "An hour or less", keeps: ["b1", "b2", "b3", "b4", "b5"] },
];

export const ACTIONS: Action[] = [
	{
		title: "Sign the petition",
		time: "30 sec",
		bucket: "b1",
		audience: "neighbor",
		tag: "Neighbor",
		href: "/act#petition",
		body: "Add your name to the demand: a human decides, and answers. That is the whole task.",
	},
	{
		title: "Share the one-pager",
		time: "2 min",
		bucket: "b2",
		audience: "neighbor",
		tag: "Neighbor",
		href: "/toolkit/one-pager",
		body: "Send it to one person who lives near a camera, a data center, or a claims office.",
	},
	{
		title: "Print and pin the one-pager",
		time: "5 min",
		bucket: "b3",
		audience: "neighbor",
		tag: "Neighbor",
		href: "/toolkit/one-pager",
		body: "Laundromat, library, break room. A broadside works on paper.",
	},
	{
		title: "Start on the Retrain page",
		time: "5 min to start",
		bucket: "b3",
		audience: "automated",
		tag: "Being automated",
		href: "/toolkit/retrain",
		body: "That pillar exists for you. Pick the next field while you still have this one. Solidarity, not pity.",
	},
	{
		title: "Speak at your council meeting",
		time: "10–20 min prep",
		bucket: "b4",
		audience: "neighbor",
		tag: "Neighbor",
		href: "/toolkit/council-script",
		body: "The two-minute script, printed. You read it, say your name, and hand the draft to the clerk.",
	},
	{
		title: "Rewrite one letter template",
		time: "1 hour",
		bucket: "b5",
		audience: "writer",
		tag: "Writer",
		href: "/act#write",
		body: "The letters are still machine-drafted and marked for rewrite. Claim one. Write it in your own words.",
	},
	{
		title: "Audit a fellow-traveler project",
		time: "1 hour",
		bucket: "b5",
		audience: "developer",
		tag: "Developer",
		href: "/about#projects",
		body: "Aequitas, Fairlearn, AI Fairness 360, audit-AI, Open Policy Agent, Activepieces. File one real issue.",
	},
	{
		title: "Review the model ordinance",
		time: "1 hour, honestly more",
		bucket: "b5",
		audience: "lawyer",
		tag: "Lawyer",
		href: "/toolkit/ordinance",
		body: "It is not legal advice until an actual attorney has read it. Be that attorney.",
	},
	{
		title: "Become a local lead",
		time: "Ongoing",
		bucket: "b6",
		audience: "neighbor",
		tag: "Neighbor",
		href: "/act#lead",
		body: "Your town's page carries your name, and you answer for it.",
		accountable: true,
	},
	{
		title: "Rewrite the site copy",
		time: "Ongoing",
		bucket: "b6",
		audience: "writer",
		tag: "Writer",
		href: "/about",
		body: "Most of this site was machine-drafted. It should not stay that way. A real, claimable job.",
	},
	{
		title: "Build accountability in",
		time: "Ongoing",
		bucket: "b6",
		audience: "developer",
		tag: "Developer",
		href: "/about#projects",
		body: "Software where a named human sign-off is enforced by the build, not by policy.",
	},
];

/**
 * Audience × time combinations that legitimately have nothing in them. The
 * matcher shows an honest empty state for these rather than a blank grid —
 * see ActionMatcher.astro.
 */
export const EMPTY_COMBOS: { audience: Audience; time: string }[] = [
	{ audience: "writer", time: "q5" },
	{ audience: "developer", time: "q5" },
	{ audience: "lawyer", time: "q5" },
];
