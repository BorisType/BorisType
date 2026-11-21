# @boristype/runtime

BorisScript runtime и polyfills для кода, сгенерированного BorisType.
Это серверные ресурсы WebSoft HCM, а не библиотека для исполнения в Node.js.

```sh
npm install @boristype/runtime@next
```

Пакет содержит скомпилированный BorisScript в `build/`, SP-XML описание библиотеки
в `build/spxml/` и сгенерированный manifest HCM-компонента `build/package.json`.
Установка через npm сама по себе не развёртывает ресурсы на сервере.
Сценарий поставки описан в [документации BorisType](https://github.com/BorisType/BorisType/blob/main/docs/guides/getting-started.md).

Это системный пакет для явного использования на платформе и совместимости с
готовыми артефактами. Компилятор в режиме `bare` не подставляет вызовы его
полифилов автоматически.

[Ограничения компилятора](https://github.com/BorisType/BorisType/blob/main/docs/reference/borisscript-constraints.md).
