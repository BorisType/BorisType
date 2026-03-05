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
    details: Полноценные import/export, npm-зависимости. Использование стандартного package.json для управления зависимостями и конфигурацией.
  - icon: ⚡
    title: Dev Mode
    details: Watch mode с инкрементальной компиляцией, автоматической линковкой и push на WebSoft HCM сервер. ~5x быстрее классической разработки без необходимости сбрасывать кеш.
  - icon: 🔄
    title: IR-транспиляция
    details: Современный подход через промежуточное представление (IR). TypeScript компилируется в валидный BorisScript с сохранением семантики.
  - icon: 🧪
    title: Надежность
    details: Встроенный тест-раннер botest с эмуляцией BorisScript защищает от регрессий транспиляции при обновлениях компилятора.
  - icon: 🛠️
    title: TypeScript Features
    details: "let/const, стрелочные функции, for-of, template literals, деструктуризация, классы (ограничено) — всё транспилируется в совместимый код."
  - icon: 🚀
    title: Сборка и деплой
    details: Полный пайплайн build → link → push. Формирование артефактов для CI/CD, автоматический push с реинициализацией модулей.
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #9169F5 30%, #B49BFA);
}

.dark {
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #A582FA 30%, #9169F5);
}
</style>
