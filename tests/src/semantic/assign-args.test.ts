function matchRoute(newUrl: string): string {
    newUrl = Trim(newUrl);
    if (StrBegins(newUrl, "/")) {
        newUrl = newUrl.substr(1);
    }
    if (StrEnds(newUrl, "/")) {
        newUrl = newUrl.substr(0, StrCharCount(newUrl) - 1);
    }

    return newUrl;
}

const result = matchRoute("/my/app/");
botest.assertValueEquals(result, "my/app", "parameter should be reassignable");

botest.assertOk();

export {};
