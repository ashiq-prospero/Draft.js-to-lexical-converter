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
  "rawtitle",
  "subrawtitle",
  "raw",
  "raw1",
  "raw2",
  "raw3",
  "rawsubtitle",
  "rawcontact",
  "rawname",
  "rawmyname",
  "rawemail",
  "rawby",
];

const excludedKeys = [
  "sectionorder",
  "titleFont",
  "bodyFont",
  "subTitleFont",
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
        obj[key] = convertDraftToLexical({ ...obj[key] }, true);
      }
      // recursively call findRawAndConvert
      else {
        obj[key] = findRawAndConvert({ ...obj[key] });
      }
    }
  });

  return obj;
}

const deleteFields = (proposal) => {
  delete proposal.draft;
  delete proposal.deliverables;
  delete proposal.history;
  delete proposal.milestones;
  
  return proposal;
}

const convertProposal = (proposal) => {
  let _proposal = {...proposal};
  const draft = _proposal.draft;
  _proposal = deleteFields(_proposal);
  _proposal.lexical = findRawAndConvert(draft);

  return _proposal;
}


proposal = convertProposal(proposal);

fs.writeFileSync(lexicalProposal, JSON.stringify(proposal), "utf-8");

// convert and output the result
// let jsonData = convertDraftToLexical(proposalJson);
console.log("output: done");
