# C# библиотеки и граница WebSoft HCM

Установка — [пользовательский гайд](../../docs/guides/dotnet.md), команды и
workspace layout — [package README](../../packages/dotnet/README.md).
Здесь находятся текущие основания решений; датированные results не становятся
acceptance новой ревизии после переноса Markdown.

- [Workspace/metadata/packaging](workspace.md): независимые проекты и версии,
  SDK versus target versus host CLR, installation ZIP/hashes и managed CI.
- [BS→.NET bridge](bridge.md): unique string ABI, resolver, Datex callback crash
  с неизвестной причиной, зависимости и пределы hot loading.
- [Bounded search](search.md): glob/UTF-8/limits/partial coverage, порядок subset,
  cooperative deadline и альтернатива grep/BS traversal.
- [Files/read grants](files-and-read-grants.md): BOM/bytes/UTF-16 ranges,
  explicit acknowledgement chain, consume/invalidate, rename и внешняя CAS гонка.
- [Platform paths/storage](../platform/paths-and-storage.md): почему physical
  System.IO и logical URL/blob не равнозначны.
- [Датированные исследования и native results](../research/dotnet/README.md).

Текущая FileSystem — **0.1.0-alpha.4/API 2**. Alpha.1 metadata-only,
alpha.2 search/API 1 и alpha.3 files/edit/API 1 — завершённые промежуточные этапы.
MCP и DLL обновляются согласованно; Node package не включает серверные DLL.
XQuery/XML object tools используют native BS API без этой DLL.

Managed tests проверяют actual temporary files, pack tests — installation artifact,
Windows/Ubuntu CI — эти managed проверки. Windows **HCM** этим не аттестован.
Native evidence относится к Linux HCM 2025.2.1333/CLR 9.0.11; probes требуют
отдельного установленного runtime и не запускаются автоматически. Команды
ручного smoke и известный crash — в [probes README](../../packages/dotnet/probes/README.md).
