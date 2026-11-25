# Регистрация mapping из компонента HCM

Проба проверяет раннюю регистрацию через публичный `Datex.XHTTP.Middleware.RegisterAspNetMapping`. Компонент публикует один диагностический GET на loopback с фиксированным ответом. Каталог компонента содержит собственный манифест, SP-XML и одну DLL. Регистрация с двумя аргументами не передаёт `Properties`. В этом обработчике параметры не требуются.

Для сборки нужны .NET SDK проекта и `Datex.XHTTP.dll`, `Websoft.Commons.dll`, `Datex.log.dll` из каталога managed-библиотек целевого стенда. Из корня checkout:

```sh
source_dir=packages/dotnet/probes/HttpMapping/Component
build_dir=$(mktemp -d)
component_dir="$build_dir/bt_http_mapping_probe"
mkdir -p "$component_dir/bin"
dotnet build "$source_dir/Component.csproj" -c Release \
  -p:WebsoftReferenceDir="$WEBSOFT_REFERENCE_DIR" -o "$build_dir/compiled"
cp -R "$source_dir/package/." "$component_dir/"
cp "$build_dir/compiled/BorisType.ComponentMappingProbe.dll" "$component_dir/bin/"
```

На отдельном совместимом стенде разместите готовый каталог в `/WebsoftServer/components/` под указанным именем. В опыте каталог передавался целиком через `WshcmUploader` в `x-local://components/`. До установки убедитесь, что имя свободно. После запуска HCM запрос из самого контейнера проверяет, что выполнился именно обработчик:

```sh
docker exec "$HCM_CONTAINER" wget -qO- --no-proxy \
  http://127.0.0.1/__boristype_component_mapping_probe
```

Ожидаемое тело — `boristype-component-mapped`. Для удаления остановите стенд, удалите только этот тестовый каталог и снова запустите. [Результаты исследования](../../../../../refs/research/dotnet/16-http-mapping-transport.md).
