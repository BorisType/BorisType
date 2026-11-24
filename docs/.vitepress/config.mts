import { defineConfig } from "vitepress";

export default defineConfig({
  title: "BorisType",
  description: "MCP, .NET библиотеки, skills и компилятор для WebSoft HCM",

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
      { text: "О проекте", link: "/guides/what-is-boristype" },
      { text: "MCP", link: "/guides/mcp-server" },
      { text: ".NET", link: "/guides/dotnet" },
      { text: "Skills", link: "/guides/agent-skills" },
      { text: "Компилятор", link: "/guides/getting-started" },
      {
        text: "Разработчикам",
        link: "https://github.com/BorisType/BorisType/blob/main/refs/README.md",
      },
    ],

    sidebar: [
      {
        text: "Работа с WebSoft HCM",
        items: [
          { text: "Что такое BorisType?", link: "/guides/what-is-boristype" },
          { text: "Подключить MCP", link: "/guides/mcp-server" },
          { text: "SOAP и XQuery: типы значений", link: "/reference/ws-client-values" },
          { text: "Установить .NET DLL", link: "/guides/dotnet" },
          { text: "Установить agent skills", link: "/guides/agent-skills" },
        ],
      },
      {
        text: "Инструменты MCP",
        items: [
          { text: "Стенд, запросы и выполнение кода", link: "/reference/mcp-execution" },
          { text: "Каталоги, формы и документы", link: "/reference/mcp-objects" },
          { text: "Настраиваемые поля и страницы", link: "/reference/mcp-custom-fields" },
          { text: "Файлы и каталоги HCM", link: "/reference/mcp-files" },
          { text: "Пакеты объектов и ZIP", link: "/reference/mcp-packages" },
        ],
      },
      {
        text: "Компиляция и поставка кода",
        items: [
          { text: "Начало работы", link: "/guides/getting-started" },
          { text: "Режимы и статус поддержки", link: "/reference/compile-modes" },
          { text: "Ограничения BorisType и JS/C runtime", link: "/reference/borisscript-constraints" },
          { text: "Линковка", link: "/guides/linking" },
          { text: "Dev Mode", link: "/guides/dev-mode" },
          { text: "Push & Deploy", link: "/guides/push-deploy" },
          { text: "Служебные объекты при запуске", link: "/guides/startup-objects" },
          { text: "Тестирование", link: "/guides/testing" },
        ],
      },
      {
        text: "Справочник компилятора",
        items: [
          { text: "btconfig.json", link: "/reference/btconfig" },
          { text: "btconfig.properties", link: "/reference/btconfig-properties" },
          { text: "Типы пакетов", link: "/reference/package-types" },
          { text: "Команда artifact", link: "/reference/artifact-command" },
        ],
      },
    ],

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
