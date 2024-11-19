const fs = require("fs");
const path = require("path");
const { shortenKeys, expandKeys } = require("./lexical/converter");

const expandedFilePath = path.join(__dirname, "./json/lexical-expanded.json");
const shortenedFilePath = path.join(__dirname, "./json/lexical-shortened.json");

try {
  // shorten extended file
  // let data = JSON.parse(fs.readFileSync(expandedFilePath, "utf-8"));
  // fs.writeFileSync(
  //   shortenedFilePath,
  //   JSON.stringify(shortenKeys(data)),
  //   "utf-8"
  // );

  // extend shortened file
  let data = JSON.parse(fs.readFileSync(shortenedFilePath, "utf-8"));
  fs.writeFileSync(expandedFilePath, JSON.stringify(expandKeys(data)), "utf-8");

} catch (error) {
  console.error("Error reading", error);
  process.exit(1);
}
