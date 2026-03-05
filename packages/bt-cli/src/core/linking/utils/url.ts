/**
 * URL-утилиты для linking
 *
 * Функции для работы с x-local:// URL, используемыми в BorisScript среде.
 * Написаны в стиле BorisScript для совместимости.
 *
 * @module linking/utils/url
 */

/**
 * Добавляет путь к URL.
 *
 * @param url - базовый URL (например `x-local://wt/myapp`)
 * @param appendPath - путь для добавления (например `init.xml`)
 * @returns URL с добавленным путём
 */
export function UrlAppenPath(url: string, appendPath: string): string {
  var parsedUrl;
  var addPath;

  parsedUrl = BmParseUrl(url);
  if (!parsedUrl.path.endsWith("/"))
    parsedUrl.path += '/';

  addPath = appendPath;
  if (addPath.charAt(0) == '/')
    addPath = addPath.slice(1);

  parsedUrl.path += addPath;
  return BmParsedUrl__GetStrValue(parsedUrl);
}

function BmParseUrl(urlStr: string): any {
  var obj: any = {};
  var tempStr: string;
  var pos: number;

  tempStr = urlStr;
  pos = String(tempStr).indexOf(':');

  if (pos >= 0) {
    obj.schema = tempStr.slice(0, pos);
    tempStr = tempStr.slice(pos + 1);
  }

  if (tempStr.startsWith('//')) {
    pos = String(tempStr).indexOf('/', 2);
    if (pos < 0)
      pos = tempStr.length;
    obj.host = tempStr.slice(2, pos);
    tempStr = tempStr.slice(pos);
  }

  if ((pos = String(tempStr).lastIndexOf('#')) > 0) {
    obj.anchor = tempStr.slice(pos + 1);
    tempStr = tempStr.slice(0, pos);
  }

  if ((pos = String(tempStr).lastIndexOf('?')) > 0) {
    obj.param = tempStr.slice(pos + 1);
    tempStr = tempStr.slice(0, pos);
  }

  obj.path = tempStr;
  if (obj.path == "" && obj.host)
    obj.path = "/";

  return obj;
}

function BmParsedUrl__GetStrValue(url: any): string {
  var tempStr = "";
  if (url.schema)
    tempStr = url.schema + ":";
  if (url.host || url.schema == "file")
    tempStr += "//" + url.host;
  tempStr += url.path;
  if (url.param)
    tempStr += "?" + url.param;
  if (url.fragment)
    tempStr += "#" + url.fragment;
  return tempStr;
}
