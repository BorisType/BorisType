export function endsWith(str: string, searchString: string): boolean {
    return str.slice(-searchString.length) === searchString;
}