import fs from "node:fs";
import path from "node:path";

/**
 * Serves the built Pagefind index at /pagefind/* during `astro dev`.
 *
 * Pagefind runs after `astro build` (see the `build` script) and writes into
 * dist/client/pagefind, so in dev those URLs 404 and /search renders an empty
 * box with no explanation — the search page looks completely broken to anyone
 * working on the site locally. This mounts the last built index read-only, so
 * search behaves in dev the way it does in production.
 *
 * The index is whatever the last build produced: content added since then
 * won't be found until you build again. That is called out in the dev log
 * rather than papered over, because a stale index that silently misses new
 * pages is exactly the kind of thing that wastes an afternoon.
 */
const TYPES = {
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".wasm": "application/wasm",
};

export default function pagefindDev({ dir = "dist/client/pagefind" } = {}) {
	return {
		name: "pagefind-dev",
		hooks: {
			"astro:server:setup": ({ server, logger }) => {
				const root = path.resolve(dir);

				if (!fs.existsSync(root)) {
					logger.warn(
						`no Pagefind index at ${dir} — /search will show its fallback list. Run \`bun run build\` once to enable search in dev.`,
					);
				} else {
					logger.info(`serving /pagefind from ${dir} (rebuild to refresh the index)`);
				}

				server.middlewares.use("/pagefind", (req, res, next) => {
					const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
					const file = path.join(root, rel);

					// Never let a crafted path escape the index directory.
					if (file !== root && !file.startsWith(root + path.sep)) {
						res.statusCode = 403;
						res.end();
						return;
					}

					fs.stat(file, (err, stat) => {
						if (err || !stat.isFile()) {
							next();
							return;
						}
						res.setHeader(
							"Content-Type",
							TYPES[path.extname(file)] ?? "application/octet-stream",
						);
						fs.createReadStream(file).pipe(res);
					});
				});
			},
		},
	};
}
