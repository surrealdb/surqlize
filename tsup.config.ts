import { defineConfig } from "tsup";

export default defineConfig({
	// The React bindings are a separate entry, so that `react` is only needed
	// by code that imports `surqlize/react`.
	entry: {
		index: "src/index.ts",
		"react/index": "src/react/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	outDir: "dist",
});
