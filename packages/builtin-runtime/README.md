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

Поддерживаемое направление разработки компилятора — **bare**. Развитие
script/module заморожено до решения стратегии памяти C-runtime: reference
counting не освобождает сильные циклы env/descriptor/receiver. Существующие
реализации и default `module` сохранены; наличие runtime в npm не означает
подтверждённую безопасность памяти или полную JS semantics этих режимов.

[Ограничения платформы и компилятора](https://github.com/BorisType/BorisType/blob/main/docs/reference/borisscript-constraints.md),
[решение о заморозке](https://github.com/BorisType/BorisType/blob/main/refs/decisions/2026-11-05-script-module-memory-freeze.md).
