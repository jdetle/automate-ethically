// Reads a secret from the environment, defensively.
//
// This exists because of a real production outage. The API keys were copied
// out of a .env file whose values are quoted (KEY="sk-ant-…") using a shell
// one-liner that split on "=" and kept everything after it — including the
// surrounding quote characters. Azure then stored a secret that was two
// characters longer than the real key, and every request to Anthropic came
// back `authentication_error: invalid x-api-key`. Nothing in the pipeline
// noticed: the value was present and non-empty, so every "is it configured"
// check passed, the route reported itself healthy, and the failure only
// surfaced as a generic "Something went wrong on our end" to visitors.
//
// Quoting, whitespace, and stray newlines are the normal failure modes of
// moving a secret by hand between a file, a terminal, a CI secret store, and
// a container. None of them are recoverable at request time and all of them
// are trivially detectable here, so this normalises them once, at the only
// place secrets enter the process.

export interface SecretReadResult {
	value: string;
	/** True when the raw value needed cleaning — a signal the secret was
	 * stored wrong at its source, not just handled wrong here. */
	repaired: boolean;
}

/**
 * Strips surrounding whitespace, then one matching pair of surrounding
 * quotes. Deliberately only one pair, and only when the quotes actually
 * match: a key that legitimately begins and ends with different characters
 * is left alone.
 */
export function readSecretDetailed(name: string): SecretReadResult {
	const raw = process.env[name];
	if (!raw) return { value: "", repaired: false };

	let value = raw.trim();
	const first = value[0];
	const last = value[value.length - 1];
	if (value.length >= 2 && (first === '"' || first === "'") && first === last) {
		value = value.slice(1, -1).trim();
	}
	return { value, repaired: value !== raw };
}

/** Reads a secret, normalised. Empty string when unset. */
export function readSecret(name: string): string {
	return readSecretDetailed(name).value;
}
