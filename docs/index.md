---
layout: home

hero:
  name: BorisType
  text: TypeScript → BorisScript
  tagline: Транспилятор TypeScript в BorisScript для платформы WebSoft HCM
  actions:
    - theme: brand
      text: Быстрый старт
      link: /guides/getting-started
    - theme: alt
      text: Что такое BorisType?
      link: /guides/what-is-boristype
    - theme: alt
      text: GitHub
      link: https://github.com/BorisType/BorisType

features:
  - icon: 📦
    title: Модульная система
    details: Экспериментальные import/export и npm-зависимости. Развитие script/module приостановлено до решения стратегии памяти C-runtime.
  - icon: ⚡
    title: Dev Mode
    details: Watch mode с инкрементальной компиляцией, автоматической линковкой и push на WebSoft HCM сервер. ~5x быстрее классической разработки без необходимости сбрасывать кеш.
  - icon: 🔄
    title: IR-транспиляция
    details: Преобразование ограниченного подмножества TypeScript через IR. Поддерживаемое направление развития — bare mode; известные расхождения описаны в reference.
  - icon: 🧪
    title: Надежность
    details: Встроенный тест-раннер botest с эмуляцией BorisScript защищает от регрессий транспиляции при обновлениях компилятора.
  - icon: 🛠️
    title: TypeScript Features
    details: "Поддержка синтаксиса зависит от режима и формы выражения. Closures, classes и polyfills имеют ограничения; script/module development on hold."
  - icon: 🚀
    title: Сборка и деплой
    details: Полный пайплайн build → link → push. Формирование артефактов для CI/CD, автоматический push с реинициализацией модулей.
---

С 2026-11-05 развитие сосредоточено на **bare mode**. Реализации `script` и
`module` сохранены вместе с регрессионными проверками; их дальнейшее развитие
приостановлено до решения стратегии памяти.
См. [режимы](./reference/compile-modes) и [ограничения](./reference/borisscript-constraints).

<style>
:root {
  --vp-home-hero-name-color: transparent;
  
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #9169F5 30%, #B49BFA);
}

.dark {
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #A582FA 30%, #9169F5);
}
</style>
