import { defineConfig } from "vitepress";

export default defineConfig({
  title: "BorisType",
  description: "Транспилятор TypeScript → BorisScript для платформы WebSoft HCM",

  lang: "ru-RU",

  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }]],

  // Для GitHub Pages: /<repo-name>/
  // Поменять если деплоим на кастомный домен
  base: "/BorisType/",

  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    logo: "/logo.svg",

    nav: [
      { text: "Руководства", link: "/guides/getting-started" },
      { text: "Справочник", link: "/reference/btconfig" },
      {
        text: "Архитектура",
        link: "https://github.com/BorisType/BorisType/tree/main/ref/architecture",
      },
    ],

    sidebar: {
      "/guides/": [
        {
          text: "Введение",
          items: [
            { text: "Что такое BorisType?", link: "/guides/what-is-boristype" },
            { text: "Быстрый старт", link: "/guides/getting-started" },
          ],
        },
        {
          text: "Руководства",
          items: [
            { text: "Линковка", link: "/guides/linking" },
            { text: "Dev Mode", link: "/guides/dev-mode" },
            { text: "Push & Deploy", link: "/guides/push-deploy" },
            { text: "Тестирование", link: "/guides/testing" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Справочник",
          items: [
            { text: "btconfig.json", link: "/reference/btconfig" },
            {
              text: "btconfig.properties",
              link: "/reference/btconfig-properties",
            },
            { text: "Режимы компиляции", link: "/reference/compile-modes" },
            { text: "Типы пакетов", link: "/reference/package-types" },
            {
              text: "Ограничения BorisScript",
              link: "/reference/borisscript-constraints",
            },
            { text: "Команда artifact", link: "/reference/artifact-command" },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/BorisType/BorisType" }],

    search: {
      provider: "local",
    },

    editLink: {
      pattern: "https://github.com/BorisType/BorisType/edit/main/docs/:path",
      text: "Редактировать на GitHub",
    },

    lastUpdated: {
      text: "Обновлено",
    },

    outline: {
      label: "На этой странице",
    },

    docFooter: {
      prev: "Предыдущая",
      next: "Следующая",
    },

    darkModeSwitchLabel: "Тема",
    sidebarMenuLabel: "Меню",
    returnToTopLabel: "Наверх",

    // BorisType theme colors
    // "#9169F5" #A582FA #B49BFA #232332
  },
});
