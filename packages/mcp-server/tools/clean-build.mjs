import { rmSync } from "node:fs";

// Resolve against this script, not caller cwd; never retain emitted removed tools.
rmSync(new URL("../build/", import.meta.url), { recursive: true, force: true });
