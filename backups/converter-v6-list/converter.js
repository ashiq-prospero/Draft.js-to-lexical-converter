const fs = require("fs");
const path = require("path");
const {
  convertTableEntityToLexical,
  convertListToLexical,
} = require("./entityConverter");
const { mergeInlineStyles } = require("./helper");



// Load Draft.js JSON data from a file
const draftFilePath = path.join(__dirname, "draft.json");

let draftContentJSON;
try {
  draftContentJSON = JSON.parse(fs.readFileSync(draftFilePath, "utf-8"));
} catch (error) {
  console.error("Error reading or parsing draft.json:", error);
  process.exit(1);
}

// Maps Draft.js block type to Lexical block type
const mapBlockTypeToLexical = (blockType) => {
  if (blockType === "blockquote") return "quote";
  if (blockType.startsWith("header")) return "heading";
  return "paragraph";
};

// Maps alignment from Draft.js block type to Lexical format
const mapBlockTypeToFormat = (blockType) => {
  if (blockType.includes("align-left")) return "left";
  if (blockType.includes("align-right")) return "right";
  if (blockType.includes("align-center")) return "center";
  if (blockType.includes("align-justify")) return "justify";
  return "";
};

// Maps direction from Draft.js block type to Lexical
const mapBlockTypeToDirection = (blockType) => {
  if (blockType.includes("direction-rtl")) return "rtl";
  if (blockType.includes("direction-ltr")) return "ltr";
  return null;
};

// Extracts indent level from Draft.js block type
const mapBlockTypeToIntent = (blockType) => {
  const match = blockType.match(/intent-left-(\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

function extractLineHeight(blockType) {
  const match = blockType.match(/line-height__([\d-]+)/);
  if (match) {
    return match[1].replace("-", ".");
  }
  return null;
}

function convertBlockToLexical(block, entityMap) {
  const type = mapBlockTypeToLexical(block.type);
  const format = mapBlockTypeToFormat(block.type);
  const direction = mapBlockTypeToDirection(block.type);
  const indent = mapBlockTypeToIntent(block.type);

  // handle table
  if (block.type === "atomic" && block.entityRanges.length > 0) {
    const entityKey = block.entityRanges[0].key;
    const entity = entityMap[entityKey];
    if (entity && entity.type === "table") {
      return convertTableEntityToLexical(entity.data);
    }
  }

  // handle lists
  if (block.type.includes("list-item")) {
    return convertListToLexical(block, entityMap, direction);
  }

  const textNodes = mergeInlineStyles(
    block.text,
    block.inlineStyleRanges,
    block.entityRanges,
    entityMap
  );

  const data = {
    children: textNodes,
    type,
    version: 1,
    textFormat: 1,
    textStyle: "",
  };

  if (format) {
    data.format = format;
  }
  if (direction) {
    data.direction = direction;
  }
  if (indent) {
    data.indent = indent;
  }

  const lineHeight = extractLineHeight(block.type);
  if (lineHeight) {
    data.style = `line-height: ${lineHeight};`;
  }

  return data;
}




// main function to convert Draft.js JSON to Lexical JSON and wrap in `editorState`
function convertDraftToLexical(draftContent) {
  const root = {
    type: "root",
    direction: "ltr",
    format: "",
    indent: 0,
    version: 1,
    children: [],
  };

  // for list we need to track previous block (depth, list type)
  const listStack = [];

  draftContent.blocks.forEach((block) => {
    const result = convertBlockToLexical(block, draftContent.entityMap);

    if (result.listType) {
      const { listType, listItem, depth } = result;

      // handle root-level list type transition
      if (
        listStack.length > 0 &&
        depth === 0 &&
        listStack[listStack.length - 1].list.listType !== listType
      ) {
        // close the previous list when transitioning list type at depth 0
        while (listStack.length > 0) {
          listStack.pop();
        }
      }

      // check if we need to create a new list
      if (
        listStack.length === 0 || // no existing list
        listStack[listStack.length - 1].depth < depth || // new nested list
        listStack[listStack.length - 1].list.listType !== listType // different list type
      ) {
        const newList = {
          type: "list",
          listType,
          version: 1,
          children: [listItem],
          direction: "ltr",
          format: "",
          indent: 0,
          start: 1,
          tag: listType === "bullet" ? "ul" : "ol",
        };

        if (listStack.length === 0) {
          // add to root if there's no parent list
          root.children.push(newList);
        } else {
          // add to the parent list
          const parentList = listStack[listStack.length - 1].list;
          parentList.children.push(newList);
        }

        // push the new list onto the stack
        listStack.push({ list: newList, depth });
      } else if (listStack[listStack.length - 1].depth === depth) {
        // add to the current list at the same depth
        const currentList = listStack[listStack.length - 1].list;
        currentList.children.push(listItem);
      } else {
        // handle stepping back in depth
        while (
          listStack.length > 0 &&
          listStack[listStack.length - 1].depth > depth
        ) {
          listStack.pop();
        }
        const currentList = listStack[listStack.length - 1].list;
        currentList.children.push(listItem);
      }
    } else {
      // add non list blocks to the root
      while (listStack.length > 0) {
        listStack.pop(); // clear the stack when moving out of lists
      }
      root.children.push(result);
    }
  });

  return {
    editorState: {
      root,
    },
  };
}

// convert and output the result
const lexicalJSON = convertDraftToLexical(draftContentJSON);
console.log("Lexical JSON Output:", JSON.stringify(lexicalJSON));
