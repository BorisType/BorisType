import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "../../build/index.js";

// Local protocol fixture: no client initialization, network or native BS execution.
const server = createServer({
  client: {
    callMethod: async () => {
      throw new Error("Unexpected SOAP call in stdio fixture");
    },
  },
  evaluator: {
    eval: async () =>
      JSON.stringify(
        JSON.stringify({
          apiVersion: 2,
          content: "  000123\r\nПривет 👋\n",
          sha256: "a".repeat(64),
          bom: false,
          startLine: 1,
          endLine: 3,
          totalLines: 3,
          startOffset: 0,
          endOffset: 20,
          totalLength: 20,
        }),
      ),
  },
});

await server.connect(new StdioServerTransport());
