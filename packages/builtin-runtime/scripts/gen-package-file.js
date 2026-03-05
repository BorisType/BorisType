const path = require('path');
const fs = require('fs');

// Импортируем функцию преобразования версий из ws-version модуля
const { convertSemverToWsVersion } = require('@boristype/ws-version');

const buildDir = path.resolve(__dirname, '../build');
const componentJsonPath = path.resolve(buildDir, 'package.json');

const packageJsonPath = path.resolve(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

// Преобразуем semver версию в ws-формат (4 компонента)
const dotnetVersion = convertSemverToWsVersion(packageJson.version);

const componentJson = {
    name: "bt-runtime",
    version: dotnetVersion,
    description: "bt-runtime",
    enableByDefault: true,
    dependencies: {},
    type: "standard",
    tags: [
        "#public"
    ]
};

console.log(`📦 Converting version: ${packageJson.version} → ${dotnetVersion}`);

fs.writeFileSync(componentJsonPath, JSON.stringify(componentJson, null, 2), 'utf-8');