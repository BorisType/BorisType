> Датированное техническое evidence; текущие основания — [тематическая запись](../../dotnet/bridge.md).
> Сохранены source revisions, hashes, provenance и ограничения исходного исследования. Текущий контракт проверяется отдельно; повторного native запуска при миграции не было.

# Точка входа для преобразования x-local URL

Дата: 2026-11-06. Статический разбор сохранённой платформенной сборки;
новых запусков HCM и native probes не было.

## Найденный API

В `Datex.Global.dll` версии **2.25.12.4**, target net9.0, есть публичный
instance method:

```csharp
// Тип Datex.Global.DatexGlobal; это сигнатура из metadata, не runtime probe.
public string UrlToFilePath(string url);
```

В C# точка вызова имеет вид `context.UrlToFilePath(url)`, где context —
платформенный `DatexGlobal`. Автоматическая передача контекста ранее проверена
для HasContext, но исполнение UrlToFilePath этим результатом не подтверждается.

Для `UrlToFilePath` metadata token `0x06000106`, CIL body 60 bytes / 20
instructions. Тело загружает строку `UrlToFilePath`, формирует аргумент и
вызывает `InvokeGlobalEnvDelegate.Invoke` (`0x060007eb`). Поэтому этот метод
является обёрткой обращения к хосту; алгоритм mapping внутри него не реализован.
Где именно хост выполняет преобразование, включая возможную native VFS часть,
этим ограниченным разбором не установлено.

Рядом есть `UrlToOptFilePath(object) -> object`, token `0x06000107`, но его
metadata access — assembly/internal. Нельзя считать его публичным C# API по
аналогии с доступной глобальной BS-функцией.

## Документация и declarations

- [UrlToFilePath](https://wshcm-docs.boristype.dev/news/platform/7160847139044029573.html):
  описано преобразование file:/x-local: в путь файловой системы, без проверки
  существования объекта. Пример для x-local возвращает относительный путь Windows;
  он не устанавливает фактическую форму результата на нашем Linux C-runtime.
- [wshcmx/types, lib/core/index.d.ts:2415](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts#L2415),
  revision `a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b`: глобальная BS declaration
  `UrlToFilePath(url: string): string`. Это референс сигнатуры BS, не C# ABI
  и не подтверждение runtime поведения.

Документация Datex может содержать ошибки. Действительные mapping, форма пути,
доступность через callback и соответствие VFS обычному System.IO ещё не проверены.

## Evidence и границы

Файл взят из ранее исследованного Linux HCM 2025.2.1333:
`dotnetcore/core/linux/Datex.Global.dll`. SHA256:
`fc4cb9134b3a8504575448660509e385c985cf566668b12556a26535646d06a4`.
MVID: `aef31945-d533-4a37-9e08-6dfabb4a912e`. Tokens относятся только к этой сборке.

REA использовал execution-free PE/CLI parser, без загрузки target в CLR:

- Assembly identity: `ev_d4f75bea1b8088d66b77d4926ad681b37f6263686f46e522885a6cec26cf07e1`.
- DatexGlobal members: `ev_dc7ad6345f29cc1b79a5bb1b1831d14aad4fde95fbb105b7f853fa1ac139c648`.
- Сигнатура/IL: `ev_7fb8a899afd19fd0179b4a6499651a34cd3b1fa48f37184167662d1c9ce37c6a`.
- Call edges: `ev_2837f2fd6a1eedfcbd4912227f1355b45b2573bf94902af61154be1ecebf0f77`.
- Имя передаваемой функции: `ev_3714af97187c44f51814887fdb2fd6918cf02cef9da24369ea6144738f238ce5`.

Практический кандидат для следующего этапа — преобразовать URL на стороне BS и
передать результат независимому C# ядру. Это сохранит core без Datex references
и managed callbacks; после проверки всё равно потребуется задать правила
относительных путей и допустимых корней. Прямой C# вызов также остаётся кандидатом
для отдельного ограниченного probe; прежний сбой EncodeJson не доказывает его сбой.
