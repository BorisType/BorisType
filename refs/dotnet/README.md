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
- [Предлагаемый контракт поставки HTTP-транспорта](http-transport-lifecycle.md) описывает первую установку через evaluator, горячее обновление backend и активацию обёртки при рестарте.
- [Kestrel и версии HTTP-обработчиков](../research/dotnet/16-http-mapping-transport.md): компонент без правки xhttp_config.json, горячие маршруты, восстановление после обновления и identity при входе через портал.
- [Датированные исследования и native results](../research/dotnet/README.md).
- [Websoft.Code и варианты OmniCode](../research/ws-client-runtime/websoft-code.md):
  поставляемый backend редактора/консоли, его side effects и отличие от provisioning.

Текущая FileSystem — **0.1.0-alpha.4/API 2**. Alpha.1 metadata-only,
alpha.2 search/API 1 и alpha.3 files/edit/API 1 — завершённые промежуточные этапы.
Общий SDK ws-client включает production DLL и автоматически подготавливает их
для MCP/будущего CLI. [Managed runtime](managed-runtime.md) описывает lifecycle,
различие installed/loaded и restart_required.
XQuery/XML object tools используют native BS API без этой DLL.

Managed tests проверяют actual temporary files, pack tests — installation artifact,
Windows/Ubuntu CI — эти managed проверки. Windows **HCM** этим не аттестован.
Native evidence относится к Linux HCM 2025.2.1333/CLR 9.0.11; probes требуют
отдельного установленного runtime и не запускаются автоматически. Команды
ручного smoke и известный crash — в [probes README](../../packages/dotnet/probes/README.md).
