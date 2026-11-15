# RegisterLibDir followup — read-only, 2026-11-14

No stand mutation/evaluator/restart. Reused complete retained PE/CIL evidence from `/tmp/bt-runtime-loading-research/rea-evidence.json`, parent `ev_9682bda414ea6a52599c0a1cedbf823d7d92e1778a796386a46610cfcc7bb4e0`. Core SHA256 `1a24258584d3f75fd30753c3999ecae98e23318ec5baa893adf0408c5fc53c38`, MVID `c8e7ffb8-8dd7-4898-bfa0-ebf0af43b098`. Only live reads: exact DOTNETLIBS-PATH option and directory existence/modes.

## Precise registration restriction

`StaticPrime.RegisterLibDir` (`0x060002f9`) forms relative path under application root; rejects a rooted result or any `..`; normalizes slashes; extracts text BEFORE FIRST slash as `parent_bin_instance_location`. It accepts registration only if a current lib directory passes this exact lambda:

`<>c__DisplayClass241_1.<RegisterLibDir>b__0` (`0x0600053f`):

```
IL 0: ldarg.1                       // each existing lib directory
IL 1: call Path.GetFileName
IL 6: ldarg.0
IL 7: ldfld parent_bin_instance_location
IL 12: call String.op_Equality
IL 17: ret
```

Equivalent: `lib_dirs.Any(p => Path.GetFileName(p) == firstRelativeSegment)`; case-sensitive ordinal string equality, no StartsWith/prefix matching.

Other registration lambdas `0x0600053c`, `0x0600053d` compare candidate directory string by `String.op_Equality` against captured normalized `t_bin_instance_location`; these are duplicate checks.

Therefore `/WebsoftServer/.boristype-runtime-fixture-.../bootstrap/...` is declined: first component `.boristype-runtime-fixture-...` matches no configured lib-directory leaf. Mere physical existence and being inside AppDirectoryPath are insufficient.

## Actual nonsecret path configuration

Read-only exact matching option from `/WebsoftServer/xHttp.ini:39`:

```
DOTNETLIBS-PATH: dotnetcore/core,dotnetcore/core/components.platform,platform,dotnetcore/libs,dotnetcore/tempdll,dotnetcore/shared,components
```

Existing directories confirmed: `dotnetcore/shared`, `dotnetcore/tempdll`, `platform`, `components`, `wt`. `wt` exists but is not configured as a managed-library root; do not choose it for automatic load.

The registration leaf check is surprising: existing leaf `shared` would allow a relative first component `shared`, but a first component `dotnetcore` is not itself one of these leaves. Thus explicit registration of a nested `dotnetcore/shared/...` path can also be declined. This does not prevent loading from that subtree: the already configured `dotnetcore/shared` is searched recursively by the resolver.

## Recommended root

Use `<AppDirectoryPath>/dotnetcore/shared/boristype-runtime/<bootstrapSimpleName>/<bootstrapSimpleName>.dll` (and similarly uniquely named helper directories). This is under a current AND native-default managed search root. No config change or additional directory registration is necessary because resolver search descends into it. Use actual package simple name in filename; remember GetAssembly drops original path to that name.

Core resolver `0x0600026c` iterates lib_dirs in order, directly tests `<root>/<simpleName>.dll`, then calls `FindAssebmbly` (`0x0600026e`) if absent. That method calls `Directory.EnumerateFiles(root, filename, SearchOption.AllDirectories)`.

Fresh inspection resolved recursive candidate filters too:

- `<>c.<FindAssebmbly>b__15_0`, `0x060004ca`: excludes paths containing directory segments `/native/` or `/refs/`; permits ordinary paths outside `/runtimes/`; inside `/runtimes/` permits Windows `runtimes/win...`, non-Windows `runtimes/linux...`, or `runtimes/netstandard...`. Uses OS directory separators in these constructions.
- `<>c.<FindAssebmbly>b__15_1`, `0x060004cb`: `candidate.Contains(CoreAssemblyLoadContext.RunTimeBaseDir)`; used as preferred match when multiple candidates remain, with fallback first candidate.

Avoid the exact segments `native`, `refs`, `runtimes` for ordinary bootstrap/helper storage. `boristype-runtime` is unaffected by the segment filter. Unique actual assembly names avoid ambiguous files in earlier roots/subdirectories.

## Failed-attempt consequence

The existing failed request may already have cached null under its requested assembly FullName. Resolver `0x0600026c` checks static managed dictionary before searching and sets its result in finally. Moving the SAME simple assembly name to the right root may still fail. For a new bounded runtime probe without restart/cache mutation, use a newly built DLL with a **fresh actual AssemblyName**, not just another folder. This is static negative-cache evidence; no miss/install retry was executed here.

This root is supported by current stand configuration plus the previously scanned native default string. A deployment with customized DOTNETLIBS-PATH omitting shared needs path discovery/configured-root selection; no global portability claim is made.
