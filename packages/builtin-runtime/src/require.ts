export namespace bt {
  type ModuleContext = {
    exports: any;
  };

  type LockMarker = {
    owner: string;
  };

  let moduleLock: Record<string, LockMarker> = {};
  let urlCache: Record<string, string> = {};
  let moduleCache: Record<string, ModuleContext> = {};

  declare const ActiveThread: {
    UniqueThreadId: string;
  };

  export function require(moduleName: string, dirname: string): any {
    // Найти модуль по имени и директории, обойти директории
    const moduleUrl = findModuleSafe(moduleName, dirname);

    // Пробуем загрузить модуль из кеша, если есть моментально вернуть
    const cachedModule: ModuleContext | undefined = GetOptObjectProperty(moduleCache, moduleUrl);
    if (cachedModule !== undefined) {
      return cachedModule.exports;
    }

    // Пробуем безопасно загрузить модуль (с блокировкой)
    const module = loadModuleSafe(moduleUrl);

    return module.exports;
  }

  function findModuleSafe(moduleName: string, dirname: string): string {
    const moduleKey = dirname + moduleName;
    let moduleUrl: string | undefined = GetOptObjectProperty(urlCache, moduleKey);
    if (moduleUrl !== undefined) {
      return moduleUrl;
    }

    moduleUrl = findModule(moduleName, dirname);
    if (moduleUrl === undefined) {
      throw "Module not found";
    }

    SetObjectProperty(urlCache, moduleKey, moduleUrl);
    return moduleUrl;
  }

  function findModule(module: string, dirname: string): string | undefined {
    if (!StrBegins(dirname, "x-local://")) {
      return undefined;
    }

    const relativeFileUrl = UrlAppendPath(dirname, module);
    const relativeFilePath = UrlToFilePath(relativeFileUrl);

    if (FileExists(relativeFilePath)) {
      if (IsDirectory(relativeFilePath)) {
        // надо попробовать найти index.js
        const indexFileUrl = UrlAppendPath(relativeFileUrl, "index.js");
        const indexFilePath = UrlToFilePath(indexFileUrl);
        if (FileExists(indexFilePath) && !IsDirectory(indexFilePath)) {
          return indexFileUrl;
        } else {
          throw "Module not found";
        }
      } else {
        return relativeFileUrl;
      }
    }

    // временное решение: искать .js файлы
    const relativeJsFileUrl = relativeFileUrl + ".js";
    const relativeJsFilePath = UrlToFilePath(relativeJsFileUrl);
    if (FileExists(relativeJsFilePath) && !IsDirectory(relativeJsFilePath)) {
      return relativeJsFileUrl;
    }

    // здесь мы ожидаем что модуль — папка с package.json
    // то есть [@scope/?package] но тут может быть [@scope/?package]/path/to/module
    // и тут еще надо искать как диеректорию с index.js или как файл .js
    // текущая реализация будет работать?
    let currentDir = dirname;
    try {
      while (currentDir !== "x-local://") {
        const currentDirNodeModules = UrlAppendPath(currentDir, "node_modules");
        const currentDirNodeModulesPath = UrlToFilePath(currentDirNodeModules);
        if (FileExists(currentDirNodeModulesPath) && IsDirectory(currentDirNodeModulesPath)) {
          const moduleDirUrl = UrlAppendPath(currentDirNodeModules, module);
          const moduleDirPath = UrlToFilePath(moduleDirUrl);

          if (FileExists(moduleDirPath)) {
            if (IsDirectory(moduleDirPath)) {
              const indexModuleFileUrl = UrlAppendPath(moduleDirUrl, "index.js");
              const indexModuleFilePath = UrlToFilePath(indexModuleFileUrl);
              if (FileExists(indexModuleFilePath) && !IsDirectory(indexModuleFilePath)) {
                return indexModuleFileUrl;
              }

              const modulePackageFileUrl = UrlAppendPath(moduleDirUrl, "package.json");

              try {
                const modulePackageData = LoadUrlData(modulePackageFileUrl);
                const modulePackageJson = ParseJson(modulePackageData) as any;
                const moduleMainFile = modulePackageJson.GetOptProperty("main");
                const mainFileUrl = UrlAppendPath(moduleDirUrl, moduleMainFile);
                const mainFilePath = UrlToFilePath(mainFileUrl);

                if (
                  moduleMainFile !== undefined &&
                  FileExists(mainFilePath) &&
                  !IsDirectory(mainFilePath)
                ) {
                  return mainFileUrl;
                }
              } catch (_err) {
                // ???
                break;
              }
            } else {
              // такой исход невозможен, т.к. нам приходят модули без указания расширения
              return moduleDirUrl;
            }
          } else {
            const moduleDirJsUrl = moduleDirUrl + ".js";
            const moduleDirJsPath = UrlToFilePath(moduleDirJsUrl);
            if (FileExists(moduleDirJsPath) && !IsDirectory(moduleDirJsPath)) {
              return moduleDirJsUrl;
            }
          }
        }

        currentDir = UrlParent(currentDir);
      }
    } catch (_err) {
      // При UrlParent(currentDir) может быть ошибка, если дошли до корня,
      // поэтому просто выходим из цикла, но оставляем текущий вариант цикла
    }

    return undefined;
  }

  function loadModuleSafe(moduleUrl: string): ModuleContext {
    requireLock(moduleUrl);
    try {
      // Еще раз проверить кеш на случай, если другой поток уже загрузил модуль, пока текущий ждал блокировки
      const cachedModule: ModuleContext | undefined = GetOptObjectProperty(moduleCache, moduleUrl);
      if (cachedModule !== undefined) {
        return cachedModule.exports;
      }

      const module = loadModule(moduleUrl);
      return module;
    } catch (err) {
      requireUnlock(moduleUrl);
      throw err;
    } finally {
      requireUnlock(moduleUrl);
    }
  }

  function loadModule(moduleUrl: string): ModuleContext {
    const moduleLib: any = OpenCodeLibrary(moduleUrl);
    const moduleContext = { exports: {} } as ModuleContext;

    SetObjectProperty(moduleCache, moduleUrl, moduleContext);

    moduleLib.__init(moduleLib, moduleContext);
    return moduleContext;
  }

  function requireLock(key: string) {
    const tid = obtainUniqueThreadId();
    const marker: LockMarker = { owner: tid };

    // Кладём свой маркер в стек
    moduleLock.AddProperty(key, marker);

    // Теперь крутимся, пока наш маркер не станет самым первым (т.е. владельцем)
    while (true) {
      const current = moduleLock.GetOptProperty(key) as LockMarker;
      if (current === marker) {
        return; // мы на вершине стека — мы владелец!
      }

      // иначе ждём немного и проверяем снова
      // можно даже sleep(0) или просто пустой цикл
      for (let i = 0; i < 100; i++) {} // лёгкий спин
      Sleep(20);
    }
  }

  function requireUnlock(key: string) {
    const tid = obtainUniqueThreadId();
    const current = moduleLock.GetProperty(key) as LockMarker; // бросит если нет

    if (current === undefined) {
      throw "not locked";
    }

    if (current.owner !== tid) {
      throw "not owner";
    }

    // Удаляем самое первое (самое старое) значение — это и есть текущий владелец
    moduleLock.DeleteOptProperty(key);
    // Теперь верхний становится следующий в очереди — автоматически!
  }

  function obtainUniqueThreadId(): string {
    let tid: string;

    function generateId(): string {
      return Random(100000, 999999) + "";
    }

    if (LdsIsServer) {
      tid = tid = ActiveThread.UniqueThreadId;
    } else {
      // @ts-ignore
      const aux = CurThreadAuxData as { UniqueThreadId?: string };
      if (aux.HasProperty("UniqueThreadId")) {
        tid = aux.UniqueThreadId!;
      } else {
        tid = generateId();
        aux.UniqueThreadId = tid;
      }
    }

    return tid;
  }

  export function init_require() {
    moduleLock = new SafeObject() as any;
    urlCache = new SafeObject() as any;
    moduleCache = new SafeObject() as any;
  }
}
