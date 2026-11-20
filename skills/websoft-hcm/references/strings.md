# Регистр и пробелы в BorisScript

В серверной пробе на Linux x64 HCM 2025.2.1333, C-runtime,
`'Инициатива'.indexOf('инициатива')` вернул `0`, а сравнение этих же строк
через `==` дало `false`. Для точного префикса на этой сборке сравнивай срез
с самим префиксом. `StrLeftCharRange` и `StrCharCount` считают символы.
У `StrLeftRange` и `.length` в этой пробе единица измерения была байтом.
Например, у `'Иниц'` получились 4 символа и 8 байт.

```js
function hasExactPrefix(text, prefix) {
  var length = StrCharCount(prefix);
  return StrCharCount(text) >= length && StrLeftCharRange(text, length) == prefix;
}

function normalizeSearchText(text) {
  text = StrReplace(text, "\u00a0", " ");
  text = StrReplace(text, "\u202f", " ");
  return StrLowerCase(Trim(UnifySpaces(text)));
}
```

Нормализуй обе строки, когда поиск должен игнорировать регистр и лишние
пробелы. Для `'  А\u00a0\u202fБ\t '` один `UnifySpaces` оставил U+00A0,
U+202F и по пробелу с краёв. С предварительными заменами и `Trim` получилось
`'а б'`. Другие виды пробелов требуют своей проверки.

Если пробел пропал ещё в значении XML-поля запроса, проверь
[SQL → XML](numbers-and-sql.md#значимые-пробелы-в-sqlxml).
[StrLeftRange](https://wshcm-docs.boristype.dev/datex/common/5620276892448878788.html#%D0%BE%D0%BF%D0%B8%D1%81%D0%B0%D0%BD%D0%B8%D0%B5) ·
[wshcmx/types, операции со строками](https://github.com/wshcmx/types/blob/1d76d40c87ad6a9c249bd16f1bfea035dd815940/lib/core/index.d.ts#L697)
