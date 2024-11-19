const fs = require("fs");
const path = require("path");
const {
  convertTableEntityToLexical,
  convertListToLexical,
} = require("./entityConverter");
const {
  convertDraftToLexical,
  shortenKeys,
  expandKeys,
  mapBlockTypeToLexical,
  mapBlockTypeToFormat,
  mapBlockTypeToDirection,
  mapBlockTypeToIntent,
  extractLineHeight,
} = require("./lexical/converter");

// Load Draft.js JSON data from a file
const draftProposal = path.join(__dirname, "./json/proposal-draft.json");
const lexicalProposal = path.join(__dirname, "./json/proposal-lexical.json");

let proposalJson;
try {
  proposalJson = JSON.parse(fs.readFileSync(draftProposal, "utf-8"));
} catch (error) {
  console.error("Error reading or parsing draft.json:", error);
  process.exit(1);
}


// convert and output the result
let jsonData = convertDraftToLexical(draftContentJSON);
jsonData = shortenKeys(jsonData);
// jsonData = expandKeys(jsonData);
// console.log("Lexical JSON Output:", JSON.stringify(lexicalJSON));
console.log("Lexical JSON Output:", JSON.stringify(jsonData));

/*
To optimize the JSON:
1 - remove editorState

2. Shorten Keys: Replace verbose keys with shorter ones
  f = format
  i = indent
  v = version
  c = children
  t = text
  s = style

3. Remove Defaults: Strip out fields that match the global defaults.
4. Compress Text: Use libraries like lz-string to compress text nodes.

*/
