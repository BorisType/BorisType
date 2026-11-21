function matchRoute(newUrl: string): string {
  newUrl = Trim(newUrl);
  if (StrBegins(newUrl, "/")) {
    newUrl = StrCharRangePos(newUrl, 1, StrCharCount(newUrl));
  }
  if (StrEnds(newUrl, "/")) {
    newUrl = StrCharRangePos(newUrl, 0, StrCharCount(newUrl) - 1);
  }

  return newUrl;
}

const result = matchRoute("/my/app/");
botest.assertValueEquals(result, "my/app", "parameter should be reassignable");

botest.assertOk();

export {};
