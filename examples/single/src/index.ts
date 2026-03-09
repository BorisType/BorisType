import { createApp } from "@boristype/http-handler";
import { WebsoftAuth } from "@boristype/http-handler/build/auth";

let counter = 0;


const app = createApp("/api/test");
app.use(WebsoftAuth());


app.get("/hello-world", (req, res) => {
  const greeting = `Hello, ${req.auth.elem?.firstname.Value ?? "Anonymous"}!`

  res.json({ message: greeting }, 200);
});

app.get("/groups", (req, res) => {
  const filter = req.queryParams.name;

  const conditions: string[] = [];
  if (filter !== undefined) {
    conditions.push(`contains($elem/name, "${filter}")`);
  }

  const conditionStr = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  const result = ArraySelectAll(tools.xquery<GroupCatalogDocumentTopElem>(`for $elem in groups ${conditionStr} return $elem`)).map((group) => ({
    id: group.id.Value,
    name: group.name.Value,
    counter: (counter += 1)
  }));

  res.json(result, 200);
});


app.register();
