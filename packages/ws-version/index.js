import semver from 'semver';

/**
 * Преобразует semver версию в формат целевой системы (4 компонента)
 * @param {string} version - Версия в формате semver
 * @returns {string} Версия в формате x.y.z.w
 * @throws {Error} Если версия невалидна или содержит компоненты > 999
 */
function convertSemverToWsVersion(version) {
  // Парсим semver версию
  const parsed = semver.parse(version);
  if (!parsed) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  const { major, minor, patch, prerelease } = parsed;

  // Проверяем ограничения (не больше 999)
  if (major > 999 || minor > 999 || patch > 999) {
    throw new Error(`Version components cannot exceed 999: ${version}`);
  }

  // Четвертый компонент для prerelease
  let fourth = 9999; // Обычные версии получают максимальное значение

  if (prerelease && prerelease.length > 0) {
    fourth = encodePrereleaseToNumber(prerelease);
  }

  return `${major}.${minor}.${patch}.${fourth}`;
}

/**
 * Кодирует prerelease информацию в число, сохраняя порядок сортировки
 * Обычные релизы получают значение 9999, prerelease - меньшие значения
 * @param {Array} prerelease - Массив prerelease компонентов
 * @returns {number} Закодированный номер
 */
function encodePrereleaseToNumber(prerelease) {
  if (!prerelease || prerelease.length === 0) {
    return 9999; // Обычные версии имеют максимальный приоритет
  }

  // Определяем базовое значение на основе типа prerelease
  const firstComponent = prerelease[0];
  let base = 0;
  
  if (typeof firstComponent === 'string') {
    switch (firstComponent.toLowerCase()) {
      case 'alpha':
        base = 1000;
        break;
      case 'beta':  
        base = 2000;
        break;
      case 'rc':
        base = 3000;
        break;
      default:
        // Для неизвестных строковых компонентов используем хеш
        base = 4000 + hashString(firstComponent) % 1000;
        break;
    }
  } else if (typeof firstComponent === 'number') {
    base = 5000;
  }

  // Добавляем числовой компонент если есть
  let offset = 0;
  if (prerelease.length > 1 && typeof prerelease[1] === 'number') {
    offset = Math.min(prerelease[1], 999); // Ограничиваем 999
  } else if (typeof firstComponent === 'number') {
    offset = Math.min(firstComponent, 999);
  }

  return base + offset;
}

/**
 * Простая хеш-функция для строк
 * @param {string} str - Строка для хеширования
 * @returns {number} Хеш-код
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Преобразуем в 32-битное целое
  }
  return Math.abs(hash);
}

/**
 * Сравнивает две версии в ws-формате 
 * @param {string} version1 - Первая версия
 * @param {string} version2 - Вторая версия  
 * @returns {-1|0|1} Результат сравнения (-1 если v1 < v2, 0 если равны, 1 если v1 > v2)
 */
function compareWsVersions(version1, version2) {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);
  
  for (let i = 0; i < 4; i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part < v2Part) return -1;
    if (v1Part > v2Part) return 1;
  }
  
  return 0;
}

/**
 * Проверяет валидность ws-версии
 * @param {string} version - Версия для проверки
 * @returns {boolean} true если версия валидна
 */
function isValidWsVersion(version) {
  const parts = version.split('.');
  if (parts.length < 3 || parts.length > 4) {
    return false;
  }
  
  return parts.every(part => {
    // Проверяем что это строка из цифр (могут быть лидирующие нули)
    if (!/^\d+$/.test(part)) {
      return false;
    }
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0;
  });
}

/**
 * Преобразует промежуток версий semver в формат ws
 * @param {string} range - Промежуток версий в формате semver (например, "^1.2.3", "~1.2.3", "*")
 * @returns {string} Промежуток версий в формате ws
 * @throws {Error} Если промежуток невалиден
 */
function convertSemverRangeToWsRange(range) {
  // Убираем лишние пробелы
  const trimmedRange = range.trim();
  
  // Обрабатываем специальный случай *
  if (trimmedRange === '*') {
    return '^0.0.0.0';
  }
  
  // Проверяем наличие префиксов ^ или ~
  const hasCaretPrefix = trimmedRange.startsWith('^');
  const hasTildePrefix = trimmedRange.startsWith('~');
  
  let version;
  if (hasCaretPrefix || hasTildePrefix) {
    // Убираем префикс для парсинга
    version = trimmedRange.slice(1);
  } else {
    // Точная версия без префикса
    version = trimmedRange;
  }
  
  // Преобразуем базовую версию
  let wsVersion;
  try {
    wsVersion = convertSemverToWsVersion(version);
  } catch (error) {
    throw new Error(`Invalid version in range "${range}": ${error.message}`);
  }
  
  // Для ^ и ~ добавляем префикс ^ в ws-формате
  if (hasCaretPrefix || hasTildePrefix) {
    return `^${wsVersion}`;
  }
  
  // Для точных версий возвращаем как есть
  return wsVersion;
}

/**
 * Проверяет валидность ws-промежутка версий
 * @param {string} range - Промежуток версий для проверки
 * @returns {boolean} true если промежуток валиден
 */
function isValidWsRange(range) {
  const trimmedRange = range.trim();
  
  // Проверяем наличие префикса ^
  if (trimmedRange.startsWith('^')) {
    const version = trimmedRange.slice(1);
    return isValidWsVersion(version);
  }
  
  // Проверяем как обычную версию
  return isValidWsVersion(trimmedRange);
}

// Экспортируем функции
export {
  convertSemverToWsVersion,
  convertSemverRangeToWsRange,
  compareWsVersions, 
  isValidWsVersion,
  isValidWsRange,
  encodePrereleaseToNumber
};