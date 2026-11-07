import { z } from "zod";

const count = z.number().int().nonnegative();
const glob = z.string().min(1).max(256);

/** Search options for the version-2 DLL JSON ABI; absent options retain the DLL defaults. */
export const searchInput = z
  .strictObject({
    path: z
      .string()
      .min(11)
      .max(4096)
      .regex(/^x-local:\/\/[^\u0000?#]+$/)
      .describe("Server directory URL (e.g. x-local://wt/web/)"),
    pattern: glob
      .optional()
      .describe("Glob filter: *, ?, whole-segment **; default **/*. Patterns without / match basenames at any depth."),
    excludePatterns: z.array(glob).max(32).optional().describe("Excluded globs; matching directories are pruned, e.g. vendor/**."),
    query: z.string().min(1).max(1024).nullable().optional().describe("Content query; omit for filename-only search."),
    regex: z.boolean().optional().describe("Use .NET line regex with a 50 ms match timeout; default false (literal)."),
    ignoreCase: z.boolean().optional().describe("Case-insensitive content search; default false. Globs stay case-sensitive."),
    maxResults: z.number().int().min(1).max(1000).optional().describe("Maximum hits, default 200; one hit per line."),
    maxEntries: z.number().int().min(1).max(100000).optional().describe("Maximum visited filesystem entries, default 10000."),
    maxDepth: z.number().int().min(0).max(32).optional().describe("Maximum directory depth, default 10; root files are depth 0."),
    maxFileBytes: z.number().int().min(1).max(8388608).optional().describe("Maximum bytes per file, default 1048576."),
    maxTotalBytes: z.number().int().min(1).max(67108864).optional().describe("Maximum actual bytes read, default 16777216."),
    timeoutMs: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .describe("Cooperative time budget, default 2000 ms; cannot interrupt blocked filesystem IO."),
    maxLineLength: z.number().int().min(1).max(8192).optional().describe("Skip lines longer than this many UTF-16 units, default 2000."),
  })
  .refine((request) => !request.regex || request.query != null, { message: "regex requires query" });

const hit = z
  .strictObject({
    // Only / delimits segments. Backslash and colon can be literal filename data on Linux.
    path: z
      .string()
      .min(1)
      .refine(
        (path) =>
          !path.startsWith("/") &&
          !path.includes("\0") &&
          !path.split("/").some((segment) => segment === ".." || segment === "." || segment === ""),
        { message: "Expected a relative slash path" },
      ),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
    text: z.string().max(8192).optional(),
  })
  .refine(
    (value) =>
      (value.line === undefined && value.column === undefined && value.text === undefined) ||
      (value.line !== undefined && value.column !== undefined && value.text !== undefined),
    { message: "Content hits require line, column and text" },
  );

/** Reject incomplete or incompatible DLL payloads instead of reporting successful empty searches. */
export const searchResponse = z.strictObject({
  apiVersion: z.literal(2),
  matches: z.array(hit).max(1000),
  limitReason: z.enum(["results", "entries", "bytes", "time", "regex", "output"]).nullable(),
  stats: z.strictObject({ visitedEntries: count.max(100000), filesRead: count.max(100000), readBytes: count.max(67108864) }),
  skipped: z.strictObject({
    links: count,
    depth: count,
    tooLarge: count,
    binary: count,
    invalidEncoding: count,
    longLines: count,
    ioErrors: count,
  }),
});
