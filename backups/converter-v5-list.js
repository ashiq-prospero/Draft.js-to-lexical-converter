const fs = require("fs");
const path = require("path");
const fontsList = require("./fonts");
const fonts = new Set([...fontsList]);

// Load Draft.js JSON data from a file
const draftFilePath = path.join(__dirname, "draft-alignment.json");

let draftContentJSON;
try {
  draftContentJSON = JSON.parse(fs.readFileSync(draftFilePath, "utf-8"));
} catch (error) {
  console.error("Error reading or parsing draft.json:", error);
  process.exit(1);
}

// Map Draft.js inline styles to Lexical format bitmask values
const STYLE_BITMASK = {
  bold: 1,
  italic: 2,
  strikethrough: 4,
  underline: 8,
  code: 16,
};

// Convert Draft.js styles to a format bitmask
const calculateFormatBitmask = (styles) =>
  styles.reduce((bitmask, style) => {
    const lowerStyle = style.toLowerCase();
    return bitmask | (STYLE_BITMASK[lowerStyle] || 0);
  }, 0);

// Extract CSS style string for non-bitmask styles (e.g., colors, backgrounds)
const extractStyleString = (styles) =>
  styles
    .filter((style) => !STYLE_BITMASK[style.toLowerCase()]) // Exclude bitmask styles
    .join(";");

// Convert Draft.js specific styles (e.g., font weight, color, bg-color)
const getStyle = (style) => {
  const lowerStyle = style.toLowerCase();
  if (!lowerStyle) return null;

  // find background color
  if (lowerStyle.startsWith("bg-"))
    return `background-color: ${lowerStyle.slice(3)};`;

  // find color
  if (lowerStyle.startsWith("rgba")) return `color: ${lowerStyle};`;

  // find color
  if (lowerStyle.startsWith("rgba")) return `color: ${lowerStyle};`;

  //  find font weight
  if (/^\d{3}$/.test(lowerStyle)) return `font-weight: ${lowerStyle};`;

  // find font size
  if (lowerStyle.endsWith("px")) return `font-size: ${lowerStyle};`;

  // find font (keep this in last)
  if (fonts.has(lowerStyle)) return `font-family: ${lowerStyle};`;

  return lowerStyle;
};

// Map Draft.js inline styles and entity ranges for links to Lexical format
function mergeInlineStyles(text, inlineStyleRanges, entityRanges, entityMap) {
  const styleMap = Array.from({ length: text.length }, () => new Set());
  const linkMap = Array(text.length).fill(null);

  // Populate styleMap with inline styles
  inlineStyleRanges.forEach(({ offset, length, style }) => {
    const parsedStyle = getStyle(style);
    if (parsedStyle) {
      for (let i = offset; i < offset + length; i++) {
        styleMap[i].add(parsedStyle);
      }
    }
  });

  // Populate linkMap with entity data for link entities
  entityRanges.forEach(({ offset, length, key }) => {
    if (entityMap[key]?.type === "LINK") {
      for (let i = offset; i < offset + length; i++) {
        linkMap[i] = key;
      }
    }
  });

  // Generate Lexical-compatible segments based on styles and link entities
  return generateSegments(text, styleMap, linkMap, entityMap);
}

// Helper function to create text/link segments based on styles and entities
function generateSegments(text, styleMap, linkMap, entityMap) {
  const segments = [];
  let currentSegmentText = "";
  let currentStyles = Array.from(styleMap[0] || []);
  let currentLinkKey = linkMap[0];

  // Iterate through characters to form styled and linked segments
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charStyles = Array.from(styleMap[i] || []);
    const charLinkKey = linkMap[i];

    // Check if the style or link entity changes
    if (
      JSON.stringify(charStyles) !== JSON.stringify(currentStyles) ||
      charLinkKey !== currentLinkKey
    ) {
      if (currentSegmentText) {
        addSegment(
          segments,
          currentSegmentText,
          currentStyles,
          currentLinkKey,
          entityMap
        );
      }
      currentSegmentText = char;
      currentStyles = charStyles;
      currentLinkKey = charLinkKey;
    } else {
      currentSegmentText += char;
    }
  }

  // Add the final segment if text remains
  if (currentSegmentText) {
    addSegment(
      segments,
      currentSegmentText,
      currentStyles,
      currentLinkKey,
      entityMap
    );
  }

  return segments;
}

// Adds a formatted text segment or a link segment
function addSegment(segments, text, styles, linkKey, entityMap) {
  const segment = {
    detail: 0,
    format: calculateFormatBitmask(styles),
    mode: "normal",
    style: extractStyleString(styles),
    text,
    type: "text",
    version: 1,
  };

  if (linkKey !== null) {
    const linkEntity = entityMap[linkKey];
    segments.push({
      children: [segment],
      direction: "ltr",
      format: "",
      indent: 0,
      type: "link",
      version: 1,
      rel: linkEntity.data.rel || "noreferrer",
      target: linkEntity.data.target || null,
      title: linkEntity.data.title || null,
      url: linkEntity.data.url || linkEntity.data.href || "",
    });
  } else {
    segments.push(segment);
  }
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

// Convert Draft.js table entity to Lexical table format
function convertTableEntityToLexical(tableData) {
  const rows = tableData.data;
  const config = tableData.config || {};
  const topRowColor = config.topRowColor || null;
  const rowColor = config.rowColor || null;

  // Convert each row and cell
  const tableRows = rows.map((row, rowIndex) => ({
    type: "tablerow",
    version: 1,
    indent: 0,
    direction: null,
    format: "",
    children: Object.entries(row)
      .filter(([key]) => key !== "id")
      .map(([_, cellText], cellIndex) => ({
        type: "tablecell",
        version: 1,
        indent: 0,
        direction: null,
        format: "",
        colSpan: 1,
        rowSpan: 1,
        backgroundColor: rowIndex === 0 ? topRowColor : rowColor,
        headerState: rowIndex === 0 ? 3 : 0, // 3 for header, 0 for regular cell
        children: [
          {
            type: "paragraph",
            version: 1,
            indent: 0,
            direction: null,
            format: "",
            textFormat: 0,
            textStyle: "",
            children: [
              {
                type: "text",
                version: 1,
                text: cellText,
                format: 0,
                style: "",
                detail: 0,
                mode: "normal",
              },
            ],
          },
        ],
      })),
  }));

  return {
    type: "table",
    version: 1,
    indent: 0,
    direction: null,
    format: "",
    colWidths: Array(Object.keys(rows[0]).length - 1).fill(92), // Set column width for each column (minus the "id" column)
    children: tableRows,
  };
}

// function extractLineHeight(blockType) {
//   const match = blockType.match(/line-height__([\d.]+)/);
//   return match ? parseFloat(match[1]) : null; // Return line height as a float or null if not present
// }

function extractLineHeight(blockType) {
  const match = blockType.match(/line-height__([\d-]+)/); // Match digits and dashes
  if (match) {
    return match[1].replace("-", ".");
  }
  return null; // Return null if no match
}

function convertBlockToLexical(block, entityMap, listStack = []) {
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


  // Handle lists
  // if (block.type === "unordered-list-item" || block.type === "ordered-list-item") {
  //   const listType = block.type === "unordered-list-item" ? "bullet" : "number";
  //   const listItem = {
  //     type: "listitem",
  //     version: 1,
  //     children: [
  //       {
  //         type: "text",
  //         text: block.text,
  //         version: 1,
  //         format: 0,
  //         style: "",
  //         detail: 0,
  //         mode: "normal",
  //       },
  //     ],
  //     direction: "ltr",
  //     format: "start",
  //     indent: block.depth,
  //     value: block.depth + 1,
  //   };

  //   return { listType, listItem, depth: block.depth };
  // }


  // Handle lists
  if (block.type === "unordered-list-item" || block.type === "ordered-list-item") {
    const listType = block.type === "unordered-list-item" ? "bullet" : "number";
    const listItem = {
      type: "listitem",
      version: 1,
      children: [
        {
          type: "text",
          text: block.text,
          version: 1,
          format: 0,
          style: "",
          detail: 0,
          mode: "normal",
        },
      ],
      direction: "ltr",
      format: "",
      indent: block.depth,
      value: 1, // Value for ordered lists
    };

    return { listType, listItem, depth: block.depth };
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

// Main function to convert Draft.js JSON to Lexical JSON and wrap in `editorState`
function convertDraftToLexical(draftContent) {
  const root = {
    type: "root",
    direction: "ltr",
    format: "",
    indent: 0,
    version: 1,
    children: [],
  };

  const listStack = []; // Track nested lists

  draftContent.blocks.forEach((block) => {
    const result = convertBlockToLexical(block, draftContent.entityMap);

    if (result.listType) {
      const { listType, listItem, depth } = result;

      // Handle a new nested list
      if (
        listStack.length === 0 ||
        listStack[listStack.length - 1].depth < depth
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
          root.children.push(newList);
        } else {
          const parentList = listStack[listStack.length - 1].list;
          parentList.children.push(newList);
        }
        listStack.push({ list: newList, depth });
      } else {
        // Add to the existing list
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
      // Add non-list blocks to the root
      while (listStack.length > 0) {
        listStack.pop(); // Clear the stack when moving out of lists
      }
      root.children.push(result);
    }
  });

  return {
    editorState: {
      root
    },
  };
}


// Convert and output the result
const lexicalJSON = convertDraftToLexical(draftContentJSON);
console.log("Lexical JSON Output:", JSON.stringify(lexicalJSON));
