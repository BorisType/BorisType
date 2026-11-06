import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "../../build/index.js";

// Local protocol fixture: no client initialization, network or native BS execution.
const server = createServer({
  client: {
    callMethod: async () => {
      throw new Error("Unexpected SOAP call in stdio fixture");
    },
  },
  evaluator: { eval: async () => JSON.stringify("  000123\r\nПривет 👋\n") },
});

await server.connect(new StdioServerTransport());
