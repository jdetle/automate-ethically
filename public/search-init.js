// Boots the Pagefind search UI on /search.
//
// A plain same-origin file, never inline, so that script-src
// can stay 'self' with no 'unsafe-inline'. Pagefind itself is same-origin
// under /pagefind/ and uses WebAssembly, which the CSP allows via
// 'wasm-unsafe-eval'.
window.addEventListener("DOMContentLoaded", () => {
	if (typeof PagefindUI === "undefined") return;
	new PagefindUI({ element: "#search", showSubResults: true });
});
