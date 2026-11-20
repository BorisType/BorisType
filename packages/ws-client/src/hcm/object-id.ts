import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,19}$/)
  .refine((id) => /^[1-9]\d{0,19}$/.test(id) && BigInt(id) <= 18446744073709551615n)
  .describe("Exact positive decimal object ID as a string, never a JSON number");
