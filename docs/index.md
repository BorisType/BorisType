---
layout: home

hero:
  name: BorisType
  text: Инструменты для WebSoft HCM
  tagline: MCP, .NET библиотеки, agent skills и компилятор ограниченного подмножества TypeScript в BorisScript
  actions:
    - theme: brand
      text: Подключить MCP
      link: /guides/mcp-server
    - theme: alt
      text: Установить skills
      link: /guides/agent-skills
    - theme: alt
      text: О проекте
      link: /guides/what-is-boristype

features:
  - title: MCP для работы с платформой
    details: Файловые операции, серверный XQuery/SQL и чтение или сохранение XML объектов. Возможности и ограничения зависят от tool.
    link: /guides/mcp-server
    linkText: Подключение и использование
  - title: .NET библиотеки
    details: BorisType.FileSystem для физических файлов. Девять файловых MCP tools требуют отдельно установленную DLL alpha.4 / API 2.
    link: /guides/dotnet
    linkText: Установка и совместимость
  - title: Agent skills
    details: Независимо устанавливаемые инструкции по WebSoft HCM, работе с MCP и веб-администратором.
    link: /guides/agent-skills
    linkText: Выбрать skill
  - title: Компилятор TypeScript → BorisScript
    details: Поддерживается ограниченное подмножество языка. Развитие сосредоточено на bare; script/module приостановлены до решения стратегии памяти.
    link: /guides/getting-started
    linkText: Начать работу с компилятором
---

MCP, DLL и skills можно использовать независимо от компилятора. Файловые tools
работают с физической файловой системой; логические URL-ресурсы в SQL storage
требуют другого подхода. См. [границы файловых операций](./guides/mcp-server#фаиловые-операции-и-ограничения).

Для компилятора CLI по умолчанию всё ещё выбирает `module`; `bare` необходимо
указать явно. Перед использованием прочитайте [режимы](./reference/compile-modes)
и [ограничения](./reference/borisscript-constraints).

Разработка инструментов, причины решений и результаты исследований собраны во
[внутренней базе](https://github.com/BorisType/BorisType/blob/main/refs/README.md).

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #9169F5 30%, #B49BFA);
}

.dark {
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #A582FA 30%, #9169F5);
}
</style>
