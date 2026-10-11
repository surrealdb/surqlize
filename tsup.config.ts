import { defineConfig } from "tsup";

export default defineConfig({
	// Each framework's bindings are a separate entry, so that the framework is
	// only needed by code that imports `surqlize/<framework>`.
	entry: {
		index: "src/index.ts",
		"svelte/index": "src/svelte/index.ts",
		"react/index": "src/react/index.ts",
		"solid/index": "src/solid/index.ts",
		"vue/index": "src/vue/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	outDir: "dist",
});
