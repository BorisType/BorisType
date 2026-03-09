const fs = require("node:fs");
const path = require("node:path");

const buildDir = fs.readdirSync("src");
const package = JSON.parse(fs.readFileSync("package.json"));
const prefix = `${package.name}+${package.version}`;
const filemap = {};

buildDir.forEach((file) => {
  const filePath = path.join("src", file);
  if (fs.statSync(filePath).isDirectory()) {
    const subFiles = fs.readdirSync(filePath);

    subFiles.forEach((subFile) => {
      const subFilePath = path.join(filePath, subFile);

      if (fs.statSync(subFilePath).isFile() && subFile.endsWith(".test.ts")) {
        const relativePath = subFilePath.replace(/\\/g, "/");

        filemap[`${prefix}+${relativePath}`] =
          "x-local://tests/" +
          relativePath.replace(/^src\//, "build/").replace(/\.test\.ts$/, ".test.js");
      }
    });
  }
});

fs.writeFileSync(path.join("build", "filemap.json"), JSON.stringify(filemap, null, 2));
