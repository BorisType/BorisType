import { readFileSync } from "node:fs";
import * as path from "node:path";
import { wshcmSchemas } from "@boristype/ws-client";

export const startupObjectApiName = "module:bt-startup-objects";
export const startupObjectInitUrl = "x-local://wt/bt-startup-objects/init.xml";

export function startupObjectIdentity(filename: string): { objectType: string; id: string } {
  const objectType = path.basename(path.dirname(path.resolve(filename)));
  const id = path.basename(filename, ".xml");
  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(objectType) ||
    !filename.endsWith(".xml") ||
    !wshcmSchemas.objects.get.shape.id.safeParse(id).success
  ) {
    throw new Error("Expected <objectType>/<positive uint64 decimal ID>.xml: " + filename);
  }
  return { objectType, id };
}

/** Both startup and single-file apply execute this exact library. */
export function startupObjectLibrary(): string {
  const resources = path.resolve(__dirname, "../../resources");
  return [
    require.resolve("@boristype/ws-client/resources/object-patch.bs"),
    path.join(resources, "startup-xml.bs"),
    path.join(resources, "startup-objects.bs"),
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}
