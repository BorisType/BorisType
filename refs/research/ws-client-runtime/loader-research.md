# WebSoft DotNetCoreHost runtime loading research — 2026-11-14

Research only. No server restart, configuration change, DLL installation/replacement, evaluator execution, callback, or credential access occurred. Read-only Docker file listing/copy; all vendor copies and retained REA evidence are outside the repository in `/tmp/bt-runtime-loading-research/`. REA binary session closed after export. Current-worktree source read directly; original-branch graph was not used or reindexed.

## Executive findings

1. **A path argument is not exact assembly binding.** Shipped `Datex.Core.StaticPrime.GetAssemblyManaged` strips the input to a simple assembly name, registers its directory, then calls `AssemblyLoadContext.LoadFromAssemblyName`. Existing binding and earlier search directories can win. Versioned directories with the same DLL simple name do not establish hot-update isolation.
2. **Normal host init reuses the context containing Datex.Core.** The presence of a collectible `Datex.Isolated` constructor does not mean ordinary GetAssembly creates/uses it.
3. **Resolver caches requests, including its null result path.** Do not call GetAssembly on an absent target as an availability probe: it may install a negative resolver-cache entry that survives later installation. This is static code evidence, not a current runtime reproduction.
4. **Compare loaded MVID with expected manifest MVID.** Do not hash `Assembly.Location` as loaded-code identity after disk replacement. `typeof(LibraryInfo).Assembly.ManifestModule.ModuleVersionId` reads loaded-module metadata. SHA256 remains a separate disk/transport check.
5. **No Windows replacement guarantee.** CLR 9.0.11 source opens PE files with READ+DELETE sharing, not WRITE sharing. This is upstream source evidence; no Windows or Linux hot-replacement test was run. An installer cannot grant itself write sharing on an already loaded file, and these flags alone do not prove `ReplaceFile`/rename-over-destination succeeds with mapped images.

## Artifacts / retained evidence

Copied from container `boristype-c-runtime-net9-wt-1`:

| Path under /WebsoftServer              | SHA256                                                             | Identity                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| dotnetcore/core/linux/Datex.Core.dll   | `1a24258584d3f75fd30753c3999ecae98e23318ec5baa893adf0408c5fc53c38` | Datex.Core 2.25.12.4, .NETCoreApp v9.0, x64, MVID `c8e7ffb8-8dd7-4898-bfa0-ebf0af43b098` |
| dotnetcore/core/linux/Datex.Global.dll | `fc4cb9134b3a8504575448660509e385c985cf566668b12556a26535646d06a4` | copied but no new member analysis needed                                                 |
| xhttp.out                              | `1333f2e1f65f0ef1fe611fc563775c76ad91cc702d6d24e03bf5121b50716776` | Linux x64 ELF native host                                                                |

REA execution-free PE/CLI parser, complete metadata/member coverage, zero issues:

- Core artifact: parent evidence `ev_a0e875c6e27e5096f3549e309ec2844b12871358bc7c42de987cc1b4efb7db6c` (summary receipt `ev_aa6cc36f7a2d68a941866a8a965e2ffc80985d6e772e8f8d6d30a8e1ac4be22c`).
- All Core members: parent `ev_9682bda414ea6a52599c0a1cedbf823d7d92e1778a796386a46610cfcc7bb4e0`.
- Selected `Datex.Core.CoreAssemblyLoadContext` / `Datex.Core.StaticPrime` methods, fields, call edges, exact CIL anchors and ldstr literals: parent `ev_31e10a25138583f854f391431fb73c9fbf246327da9ae5712d91655de2dbb7ca`.
- Export: `/tmp/bt-runtime-loading-research/rea-evidence.json` (18,086,777 bytes, 11 records). Static PE inspection did not execute or load vendor code into a CLR.
- Native host open succeeded. Whole-program Ghidra inventory took too long and its waiting orchestration cell was terminated; native decompilation/xref conclusions are not asserted. No unchanged native analysis was retried. Session was later closed.

## Exact managed loading code evidence

Tokens below are build-local to the Core SHA256/MVID above, all from selected-member evidence.

### Native entry bridge / managed implementation

`StaticPrime.GetAssembly`, token `0x060002ae`: decodes the native BmStr input as ASCII, calls `GetAssemblyManaged(input, null)` at IL 98, allocates a normal GCHandle (`GCHandleType` integer 2) for a non-null returned Assembly, returns handle pointer. Thus this managed entry is explicitly built for the native bridge.

Native `xhttp.out` independently contains these ASCII strings at exact file offsets (Python byte scan, not REA xref evidence): `coreclr_create_delegate` at `0x413450`, `GetAssembly` at `0x413468`, `DotNetCoreHost` at `0x413641`, `Datex.Core.StaticPrime+GetAssemblyEntryPoint, Datex.Core` at `0x4233e0`; error string for GetAssembly delegate pointer at `0x423420`. This ties the native host to the named Core entry by shipped strings, but full native call-site linkage remains unverified.

### Input paths and context

`StaticPrime.GetAssemblyManaged`, `0x060002af`:

- IL 2–15: null/empty -> `Datex.Core.dll`.
- IL 17–24: computes input `String.GetHashCode(StringComparison)` with constant 5 (OrdinalIgnoreCase); this local is not used as a lookup in this method.
- IL 25–45: `new AssemblyName(Path.GetFileNameWithoutExtension(input) ?? "")`.
- IL 46–65: `Path.GetDirectoryName(input)` -> if nonempty `RegisterLibDir(directory)`.
- IL 67–90: supplied ALC, else static `StaticPrime.AssemblyLoadContext`, -> `LoadFromAssemblyName(assemblyName)`.
- IL 103–109: `VerifyAssembly`.
- No caller-path `LoadFromAssemblyPath(input)` occurs in this method.

`StaticPrime.InitManaged`, `0x060002a6`, IL 10–111: if static ALC is null, sets it using `AssemblyLoadContext.GetLoadContext(typeof(StaticPrime).Assembly)` and attaches the managed/native Resolving handlers.

`CoreAssemblyLoadContext..ctor`, `0x06000269`: invokes base ALC constructor with `"Datex.Isolated", true` (collectible). The normal InitManaged path above does not instantiate it. Existence is not evidence of hot unloading or per-request isolation.

`StaticPrime.RegisterLibDir`, `0x060002f9`:

- IL 25–74: computes path relative to application directory, declines rooted relative output or any path containing `..`.
- IL 106–272: requires parent-directory segment and checks it against allowed lib_dirs using a predicate (exact predicate body not decoded in selected type set).
- IL 277–424: normalizes into app path, appends new directory to existing `lib_dirs` rather than prepending it.
- Also derives/registers `runtimes/linux-x64/native` or `runtimes/win-x64/native`.

Consequences: absolute physical paths under application/allowed roots are syntactically accepted and can contribute a search directory; arbitrary external absolute paths are declined for registration. Calling a path does not guarantee that file is used. First request of same simple name can bind an existing earlier matching file.

### Resolver search / caching

`CoreAssemblyLoadContext.CoreAssemblyLoadContext_Resolving`, `0x0600026c`:

- IL 0–26: static field `managed` (`0x040000b7`) dictionary lookup with `Utils.GetHashCode3(requestedAssemblyName.FullName)`; returns the dictionary result immediately on hit.
- IL 135–419: iterates `StaticPrime.lib_dirs` in order; constructs `<dir>/<requested.Name>.dll`; if absent in existing dir calls recursive `FindAssebmbly`; first existing candidate is loaded with `context.LoadFromAssemblyPath(candidate)` at IL 255.
- On exception from direct path load, clears requested CultureInfo/Version and retries LoadFromAssemblyName (IL 318–343).
- IL 514–536 (finally): writes the result to `managed` under the requested FullName hash, including the null-result execution path. Null cache storage/negative caching is the static candidate; no live miss-then-install reproduction was attempted.
- Keys omit original caller path. Static cache is shared across instances of this type. CLR ALC's own assembly binding also applies before Resolving.

`FindAssebmbly` (spelling shipped), `0x0600026e`: `Directory.EnumerateFiles(dir, filename, SearchOption.AllDirectories)` at IL 0–3, applies predicates, returns a candidate. Exact lambda preference filters are outside selected types and remain unresolved; do not rely on deterministic version-directory selection.

## Metadata and runtime status without target preload

For active identity once target DLL is loaded, add fields to existing `LibraryInfo.GetMetadataJson()`:

```csharp
Assembly assembly = typeof(LibraryInfo).Assembly;
string mvid = assembly.ManifestModule.ModuleVersionId.ToString("D");
string assemblyVersion = assembly.GetName().Version!.ToString();
```

Keep informational version/API version/capabilities. Compare **MVID + expected name/API contract** against bundle manifest; use disk SHA256 separately. MVID is a build identifier, not a cryptographic trust check; deterministic identical builds may share it, and it is not a replacement for SHA256 integrity.

Evidence for loaded metadata semantics: dotnet/runtime tag v9.0.11, `src/coreclr/System.Private.CoreLib/src/System/Reflection/RuntimeModule.cs` lines 436–441: `ModuleVersionId` calls `MetadataImport.GetScopeProps(out Guid mvid)` and returns it. It does not reread `Assembly.Location`.

A target method cannot observe whether the target was loaded _before_ the GetAssembly call that made the method available. To establish a true pre-load baseline, use a separate uniquely named pure managed inspector (or separately validate a BCL reflection route):

```csharp
AppDomain.CurrentDomain.GetAssemblies()
    .Where(a => a.GetName().Name == expectedSimpleName)
```

Return only requested target's FullName/MVID/Location plus ALC name/IsCollectible and process/CLR/OS identity. No Assembly.Load/LoadFrom/GetAssemblyName call is needed to enumerate loaded assemblies. `AppDomain.GetAssemblies()` at v9.0.11 `src/libraries/System.Private.CoreLib/src/System/AppDomain.cs:243` delegates to `AssemblyLoadContext.GetLoadedAssemblies()`.

Safe general runtime fields from inspector: `RuntimeInformation.FrameworkDescription`, `RuntimeInformation.OSDescription`, `RuntimeInformation.ProcessArchitecture`, `RuntimeInformation.OSArchitecture`, `Environment.Version.ToString()`, `Environment.Is64BitProcess`; optionally process ID/start time to recognize restart. These pure BCL reads need no Datex context or callback. BCL BS bridge access to these getters has not been validated on this stand. Loading a separate inspector still loads _that inspector_, but not the target DLL.

## Windows installation implications

Upstream runtime v9.0.11 source, `src/coreclr/vm/peimage.cpp:871–882`, opens assembly with `GENERIC_READ | GENERIC_EXECUTE` on Windows and `FILE_SHARE_READ | FILE_SHARE_DELETE`; no `FILE_SHARE_WRITE`. Copy is retained as `/tmp/bt-runtime-loading-research/runtime-v9.0.11-peimage.cpp`, SHA256 `0381e80fbf9d481091a4e3f04626c267a1da776109a5700dccf9222eb52fd665`.

- This is source evidence for CoreCLR's PE-image path at this tag, not observation of a Windows HCM build.
- The updater's FileShare setting cannot override a preexisting loader handle or mapped-image constraints.
- Delete sharing can permit some rename/delete operations; it does **not** by itself guarantee atomic replacement of an existing mapped destination succeeds on all supported Windows/filesystems/security configurations.
- Never truncate/overwrite a loaded file in place. Linux allowing unlink/rename is not evidence that hot loading changed, and in-place writes to mapped files may be hazardous.
- Conservative stable-name policy: stage/verify complete expected bytes; do not claim active version from disk alone; if loaded MVID differs, report restart required. If installation cannot safely replace the existing path, preserve existing file and return structured restart/install failure. No new ALC/hot-swap promise.

## Minimal bounded probe for main (suggestion only; not executed)

1. Build a separate uniquely named, dependency-free net9 inspector outside repo; its only operation returns whitelisted target loaded identities and CLR/OS/ALC metadata using the BCL operations above. No callbacks, writes, reflection invoke or target load. Place only new filenames and run via existing bounded ws-client evaluator. Capture image/container, hashes/MVIDs, request and response.
2. Read inspector baseline **before** any target GetAssembly. This avoids contaminating install choice and avoids negative-cache probe.
3. After main's authorized safe first install, call target GetMetadataJson; compare returned loaded MVID to package manifest, then call inspector again. Repeat getter in a second evaluator/request to observe stable process binding. Do not replace an existing loaded DLL.
4. Optional isolated path semantics probe: use a fresh unique simple assembly name with pure marker method. Copy version A only into a new allowed child directory, load its full physical path, observe marker/MVID. Then copy version B with the same simple name into a different new directory (new path, no existing file replaced), call path B, inspect marker/MVID. Expect A to remain bound; fail/stop on unexpected runtime or transport error. Parent directories are searched recursively, so first-load directory-selection tests with both candidates already present would be ambiguous.
5. Cleanup disposable evaluator/new files only; loaded handles/modules may remain until process restart. No request for restart is part of this probe.

Hot replacement, Windows file operations, cache invalidation/unload, multiple load contexts, all supported platform revisions and failed-miss recovery remain unverified. No Datex callback experiment is needed for provisioning/status.

## Documentation and declarations (separate evidence classes)

- https://wshcm-docs.boristype.dev/datex/common/7172076235998782943.html explicitly says `.NET Framework (4.x)` and `GetAssembly(libName)` with library-name argument only. It is insufficient Core semantics evidence.
- https://wshcm-docs.boristype.dev/news/platform/7304550985252199937.html#%D0%B7%D0%B0%D0%B3%D1%80%D1%83%D0%B7%D0%BA%D0%B0-%D0%BA%D0%BE%D0%BC%D0%BF%D0%BE%D0%BD%D0%B5%D0%BD%D1%82%D0%B0 documents XQueryExpr's .NET 9 component initializer loading bin/Websoft.XQueryExpr.dll via DotNetCoreHost and storing its assembly wrapper for the session. Application-level wrapper cache is not loader-cache specification; article postdates shipped stand version.
- https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/dotnetcorehost/index.d.ts declares `Object.GetAssembly(dllName: string)` -> CreateClassObject / CallClassStaticMethod. No nonloading IsLoaded, cache reset, unload, or runtime-info method is declared here; declaration absence is not runtime absence proof.
- https://github.com/dotnet/runtime/blob/v9.0.11/src/coreclr/vm/peimage.cpp#L871
- https://github.com/dotnet/runtime/blob/v9.0.11/src/coreclr/System.Private.CoreLib/src/System/Reflection/RuntimeModule.cs#L436
- https://github.com/dotnet/runtime/blob/v9.0.11/src/libraries/System.Private.CoreLib/src/System/AppDomain.cs#L243

Historical repository C-runtime first-load smoke and callback crash evidence were read from refs/dotnet/bridge.md and refs/research/mcp/06-dotnet-probe.md; neither is a current hot-replacement test.
