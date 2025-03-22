const fs = require("fs");
const path = require("path");
const { convertDraftToLexical } = require("./lexical/converter");

const draftProposal = path.join(__dirname, "./json/proposal-draft.json");
const lexicalProposal = path.join(__dirname, "./json/proposal-lexical.json");

let proposal;
try {
  proposal = JSON.parse(fs.readFileSync(draftProposal, "utf-8"));
} catch (error) {
  console.error("Error reading or parsing draft.json:", error);
  process.exit(1);
}

const raws = [
  "raw",
  "rawtitle",
  "subrawtitle",
  "rawtitle",
  "rawsubtitle",
  "rawcontact",
  "rawname",
  "rawemail",
  "rawtitle",
  "rawmyname",
  "rawby",
];

const excludedKeys = [
  "sectionorder",
  "titleFont",
  "bodyFont",
  "variables",
  "headerConfig",
  "titleStyle",
];

function findRawAndConvert(obj) {
  if (!obj) {
    return obj;
  }

  // find all object keys
  const objKeys = Object.keys(obj).filter(
    (key) => !excludedKeys.includes(key) && typeof obj[key] === "object"
  );
  objKeys.forEach((key) => {
    if (!excludedKeys.includes(key) || typeof obj[key] === "object") {
      if (raws.includes(key)) {
        // if raw then convert to lexical
        obj[key] = convertDraftToLexical({ ...obj[key] });
      }
      // recursively call findRawAndConvert
      else {
        obj[key] = findRawAndConvert({ ...obj[key] });
      }
    }
  });

  return obj;
}

proposal.draft = findRawAndConvert(proposal.draft);
fs.writeFileSync(lexicalProposal, JSON.stringify(proposal), "utf-8");

// convert and output the result
// let jsonData = convertDraftToLexical(proposalJson);
console.log("output: done");
