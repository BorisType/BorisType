# @boristype/ws-version

Преобразует semver в строку `major.minor.patch.fourth` для metadata WebSoft HCM.
Это утилита Node.js, не BorisScript runtime и не доказательство platform version
comparison на всех HCM.

## Установка и использование

```sh
npm install @boristype/ws-version
```

```javascript
import {
  convertSemverToWsVersion,
  convertSemverRangeToWsRange,
  compareWsVersions,
  isValidWsVersion,
  isValidWsRange,
} from "@boristype/ws-version";

convertSemverToWsVersion("1.2.3-beta.1"); // "1.2.3.2001"
convertSemverToWsVersion("1.2.3"); // "1.2.3.9999"
convertSemverRangeToWsRange("~1.2.3"); // "^1.2.3.9999"
convertSemverRangeToWsRange("*"); // "^0.0.0.0"
compareWsVersions("1.0.0.1001", "1.0.0.9999"); // -1
isValidWsVersion("1.0.0"); // true
isValidWsRange("~1.0.0.0"); // false
```

## Преобразование и ограничения

Semver major/minor/patch должны быть <=999, build metadata отбрасывается.
Четвёртая компонента:

| Prerelease                  | Код                                        |
| --------------------------- | ------------------------------------------ |
| Нет                         | `9999`                                     |
| `alpha.N`                   | `1000 + min(N,999)`                        |
| `beta.N`                    | `2000 + min(N,999)`                        |
| `rc.N`                      | `3000 + min(N,999)`                        |
| Неизвестная строковая метка | `4000 + hash(label)%1000 + numeric offset` |
| Числовой первый компонент   | `5000 + min(number,999)`                   |

Только второй numeric компонент добавляется к строковой метке; дальнейшие
компоненты игнорируются. Преобразование **не сохраняет общий semver ordering**:
`alpha.999` и `alpha.1000` совпадают; неизвестные labels могут иметь hash collision,
case folding и свой порядок. `~` превращается в `^`, поэтому эквивалентность ranges
не гарантируется. Поддержаны только полная exact версия, `^`, `~` и `*`,
не составные comparators, wildcards `1.x`, hyphen/OR ranges.

## API

- `convertSemverToWsVersion(version): string` — бросает Error при неверном semver/компоненте >999.
- `convertSemverRangeToWsRange(range): string` — преобразует перечисленные формы, иначе Error.
- `compareWsVersions(a,b): -1|0|1` — численно сравнивает первые четыре компонента,
  отсутствующая четвёртая считается нулём; сам input не валидирует.
- `isValidWsVersion(version): boolean` — проверяет 3–4 непустые decimal компоненты,
  допускает ведущие нули; не ограничивает safe-integer precision.
- `isValidWsRange(range): boolean` — exact ws-version либо `^` + ws-version.
- `encodePrereleaseToNumber(parts): number` — тот же внутренний numeric encoding.

Большие значения могут пройти lexical validation, но сравнение использует JS
Number и не гарантирует точность сверх safe-integer. Проверяйте валидность
и ограничивайте компоненты в своём контракте.

## Разработка

Из checkout: `pnpm --filter @boristype/ws-version build` и
`pnpm --filter @boristype/ws-version test`. Тесты проверяют Node utility,
не установку metadata на HCM. License: MIT.
