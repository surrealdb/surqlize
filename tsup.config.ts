import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/migrate.ts", "src/cli.ts"],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	outDir: "dist",
});
