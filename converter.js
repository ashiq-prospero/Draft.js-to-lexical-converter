const fs = require("fs");
const path = require("path");
const {
  convertTableEntityToLexical,
  convertListToLexical,
} = require("./entityConverter");
const {
  mergeInlineStyles,
  shortenKeys,
  expandKeys,
  mapBlockTypeToLexical,
  mapBlockTypeToFormat,
  mapBlockTypeToDirection,
  mapBlockTypeToIntent,
  extractLineHeight,
} = require("./helper");

// Load Draft.js JSON data from a file
const draftFilePath = path.join(__dirname, "./json/draft.json");

let draftContentJSON;
try {
  draftContentJSON = JSON.parse(fs.readFileSync(draftFilePath, "utf-8"));
} catch (error) {
  console.error("Error reading or parsing draft.json:", error);
  process.exit(1);
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

    if (entity?.type) {
      if (entity.type === "table") {
        return convertTableEntityToLexical(entity.data);
      } else if (entity.type === "divider") {
        return {
          type: "horizontalrule",
        };
      }
      //  else if (entity.type === "html") {
      //   return {
      //     type: entity.type,
      //     data: entity.data.htmlCode,
      //     config: entity.data.config,
      //   };
      // } else if (entity.type === "TOKEN") {
      //   // why are we storing json as string instead of object
      //   return {
      //     type: entity.type,
      //     data: entity.data.texcontent,
      //   };
      // } else if (entity.type === "media") {
      //   return {
      //     type: entity.type,
      //     data: entity.data,
      //   };
      // } else if (entity.type === "image") {
      //   return {
      //     type: entity.type,
      //     data: entity.data.src,
      //     config: entity.data.config,
      //   };
      // } else if (["form", "gallery", "testimonial"].includes(entity.type)) {
      //   return {
      //     type: entity.type,
      //     data: entity.data.data,
      //     config: entity.data.config,
      //   };
      // }

      return {
        type: "horizontalrule",
      };
    }
  }

  // handle lists
  if (block.type.includes("list-item")) {
    return convertListToLexical(block, entityMap, direction);
  }

  const data = {
    children: mergeInlineStyles(
      block.text,
      block.inlineStyleRanges,
      block.entityRanges,
      entityMap
    ),
  };

  if (type) {
    data.type = type;
  }
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

    defaults: {
      direction: "ltr",
      format: "",
      indent: 0,
      version: 1,
    },
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
          start: 1,
          tag: listType === "bullet" ? "ul" : "ol",
          children: [listItem],
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
let jsonData = convertDraftToLexical(draftContentJSON);
jsonData = shortenKeys(jsonData);
jsonData = expandKeys(jsonData);
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
