# Обновление обёртки IDatexHttpMapping

Проба устанавливает диагностический компонент на отдельный Linux HCM и дважды перезапускает его web-процесс. HTTP GET с loopback возвращает версию, MVID и идентификатор экземпляра mapping. Установку выполняет штатный авторизованный SOAP evaluator. Компонент регистрирует единственный маршрут при старте через `Middleware.RegisterAspNetMapping`.

Нужны одноразовый контейнер Linux HCM с одной сетью и доступным с машины теста IPv4 контейнера, Docker CLI, Python 3, Node/pnpm и .NET SDK проекта. Задайте `WSHCM_USERNAME` и `WSHCM_PASSWORD` тестовой учётной записи с доступом к evaluator. В `WEBSOFT_REFERENCE_DIR` укажите локальный каталог с `Datex.XHTTP.dll`, `Websoft.Commons.dll` и `Datex.log.dll` из целевой поставки.

```sh
pnpm --filter @boristype/ws-client build
python3 packages/dotnet/probes/HttpMapping/Component/verify-upgrade.py "$HCM_CONTAINER" "$WEBSOFT_REFERENCE_DIR"
```

1. Runner проверяет, что имя компонента и каталог установки свободны. SDK подготавливает V1. Runner публикует три проверенных файла компонента одним переименованием каталога. Маршрут пока отвечает 404.
2. После первого рестарта маршрут отвечает V1. SDK подготавливает V2 рядом с V1 и меняет `active.json`. Повторный вызов клиента V1 сохраняет выбор V2. Обе DLL проверяются по SHA-256.
3. После второго рестарта обработчик возвращает MVID V2 и новый идентификатор экземпляра. Runner сверяет также байты `xhttp_config.json` и трёх файлов компонента.

Локальные сборки удаляются по завершении. Для очистки стенда удалите одноразовый контейнер и его тома. [Результаты и ограничения](../../../../../refs/research/dotnet/16-http-mapping-transport.md#смена-версии-обёртки-при-рестарте).
