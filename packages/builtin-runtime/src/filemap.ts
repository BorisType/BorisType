export namespace bt {
  const fileMap: Record<string, string> = {};

  export function getFileUrl(fileKey: string): string {
    return fileMap.GetOptProperty(fileKey);
  }

  export function loadFileMap(fileMapFileUrl: string): void {
    // @ts-ignore
    const fileMapContent = LoadUrlText(fileMapFileUrl);
    const fileMapJson: any = ParseJson(fileMapContent);
    for (const fileKey in fileMapJson) {
      fileMap.SetProperty(fileKey, fileMapJson.GetProperty(fileKey));
    }
  }
}
