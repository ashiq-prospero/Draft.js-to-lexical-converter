const fs = require("fs");
const path = require("path");
const { convertProposal, convertToVariableNodes } = require("./lexical/converter");

// proposal to be converted
const draftProposal = path.join(__dirname, "./json/proposal-draft.json");
// output file after conversion
const lexicalProposal = path.join(__dirname, "./json/proposal-lexical.json");

let proposal;
try {
  proposal = JSON.parse(fs.readFileSync(draftProposal, "utf-8"));
} catch (error) {
  console.error("Error reading or parsing draft.json:", error);
  process.exit(1);
}


// convert the proposal to lexical format
proposal = convertProposal(proposal);
// save the output to a file
fs.writeFileSync(lexicalProposal, JSON.stringify(proposal, null, 2), "utf-8");


// const root = {"type":"root","children":[{"children":[{"text":"I will provide {{client.firstName}} the following services for you","type":"text"}],"type":"paragraph","direction":"ltr"},{"children":[{"text":"Proposal : {{proposal.name}}","type":"text"}],"type":"paragraph","direction":"ltr"}]};
// const output = convertToVariableNodes(root)
// console.log(JSON.stringify(output, null, 2));


// convert and output the result
// let jsonData = convertDraftToLexical(proposalJson);
console.log("output: done");
