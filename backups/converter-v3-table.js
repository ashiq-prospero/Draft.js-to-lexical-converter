const fs = require("fs");
const path = require("path");

// Load Draft.js JSON data from a file
const draftFilePath = path.join(__dirname, "draft.json");

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
  styles.reduce(
    (bitmask, style) => bitmask | (STYLE_BITMASK[style.toLowerCase()] || 0),
    0
  );

// Extract CSS style string for non-bitmask styles (e.g., colors, backgrounds)
const extractStyleString = (styles) =>
  styles
    .filter((style) => !STYLE_BITMASK[style.toLowerCase()]) // Exclude bitmask styles
    .join(";");

// Convert Draft.js specific styles (e.g., font weight, color, bg-color)
const getStyle = (style) => {
  const lowerStyle = style.toLowerCase();
  if (!lowerStyle) return null;

  if (/^\d{3}$/.test(lowerStyle)) return `font-weight: ${lowerStyle};`;
  if (lowerStyle.startsWith("bg-"))
    return `background-color: ${lowerStyle.slice(3)};`;
  if (lowerStyle.startsWith("rgba")) return `color: ${lowerStyle};`;
  if (lowerStyle.endsWith("px")) return `font-size: ${lowerStyle};`;
  if (lowerStyle === 'georgia') return `font-family: ${lowerStyle};`;
    
  return lowerStyle;
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

// Converts a Draft.js block to a Lexical-compatible format
// function convertBlockToLexical(block, entityMap) {
//   const type = block.type.startsWith("header") ? "heading" : "paragraph";
//   const textNodes = mergeInlineStyles(
//     block.text,
//     block.inlineStyleRanges,
//     block.entityRanges,
//     entityMap
//   );

//   return {
//     children: textNodes,
//     direction: "ltr",
//     format: "",
//     indent: 0,
//     type,
//     version: 1,
//     textFormat: 1,
//     textStyle: "",
//   };
// }

function convertBlockToLexical(block, entityMap) {
  if (block.type === "atomic" && block.entityRanges.length > 0) {
    const entityKey = block.entityRanges[0].key;
    const entity = entityMap[entityKey];
    if (entity && entity.type === "table") {
      return convertTableEntityToLexical(entity.data);
    }
  }

  const type = block.type.startsWith("header") ? "heading" : "paragraph";
  const textNodes = mergeInlineStyles(
    block.text,
    block.inlineStyleRanges,
    block.entityRanges,
    entityMap
  );

  return {
    children: textNodes,
    direction: "ltr",
    format: "",
    indent: 0,
    type,
    version: 1,
    textFormat: 1,
    textStyle: "",
  };
}

// Main function to convert Draft.js JSON to Lexical JSON and wrap in `editorState`
function convertDraftToLexical(draftContent) {
  return {
    editorState: {
      root: {
        children: draftContent.blocks.map((block) =>
          convertBlockToLexical(block, draftContent.entityMap)
        ),
        direction: "ltr",
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    },
  };
}

// Convert and output the result
const lexicalJSON = convertDraftToLexical(draftContentJSON);
console.log("Lexical JSON Output:", JSON.stringify(lexicalJSON));
