// Boots the Pagefind search UI on /search.
//
// A plain same-origin file, never inline, so that script-src can stay 'self'
// with no 'unsafe-inline'. Pagefind itself is same-origin under /pagefind/
// and uses WebAssembly, which the CSP allows via 'wasm-unsafe-eval'.
//
// The static page ships a full list of every page under #search-fallback.
// This removes that list only after the search UI has really mounted, so a
// missing index, a blocked script, or a thrown constructor all leave the
// visitor with something they can use rather than an empty box.
window.addEventListener("DOMContentLoaded", () => {
	const host = document.getElementById("search");
	const fallback = document.getElementById("search-fallback");
	if (!host || typeof PagefindUI === "undefined") return;

	try {
		new PagefindUI({ element: "#search", showSubResults: true });
	} catch {
		return;
	}

	// Mounting is synchronous, but assert it rather than assume it: if the
	// container is still empty, Pagefind did not take, and the list stays.
	if (host.childElementCount === 0) return;
	fallback?.remove();
});
