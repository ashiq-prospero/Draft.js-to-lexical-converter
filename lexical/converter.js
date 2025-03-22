const fontsList = require("./fonts");
const fonts = new Set([...fontsList]);


const SHORTEN = true;


const keyMapping = {
  format: "f",
  indent: "i",
  version: "v",
  children: "c",
  text: "tx",
  type: "t",
  style: "s",
  mode: "m",
  direction: "d",
};

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
    .filter((style) => !STYLE_BITMASK[style.toLowerCase()])
    .join(";")
    .replace(/;{2,}/g, ";");

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
        if (styleMap[i]) {
          styleMap[i].add(parsedStyle);
        }
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
    text,
    type: "text",
  };

  const style = extractStyleString(styles);
  if (style?.length) {
    segment.style = style;
  }

  const format = calculateFormatBitmask(styles);
  if (format) {
    segment.format = format;
  }

  if (linkKey !== null) {
    const linkEntity = entityMap[linkKey];
    segments.push({
      children: [segment],
      type: "link",
      rel: linkEntity.data.rel || "noreferrer",
      target: linkEntity.data.target || null,
      title: linkEntity.data.title || null,
      url: linkEntity.data.url || linkEntity.data.href || "",
    });
  } else {
    segments.push(segment);
  }
}

// -------------- shortend or extent the lexical keys  ----------------

function shortenKeys(data) {
  function shorten(obj) {
    if (Array.isArray(obj)) {
      return obj.map(shorten);
    } else if (obj !== null && typeof obj === "object") {
      const shortenedObj = {};
      for (const key in obj) {
        const shortKey = keyMapping[key] || key;
        shortenedObj[shortKey] = shorten(obj[key]);
      }
      return shortenedObj;
    }
    return obj;
  }

  return shorten(data);
}

// Function to expand keys
function expandKeys(data) {
  const reverseMapping = Object.fromEntries(
    Object.entries(keyMapping).map(([key, value]) => [value, key])
  );

  function expand(obj) {
    if (Array.isArray(obj)) {
      return obj.map(expand);
    } else if (obj !== null && typeof obj === "object") {
      const expandedObj = {};
      for (const key in obj) {
        const longKey = reverseMapping[key] || key;
        expandedObj[longKey] = expand(obj[key]);
      }
      return expandedObj;
    }
    return obj;
  }

  return expand(data);
  // return { editorState: { root: expand(data) } };
}
// -------------- END of shortend or extent the lexical keys  ----------------

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
  return null;
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

    if (entity?.type) {
      if (entity.type === "table") {
        return convertTableEntityToLexical(entity.data);
      } else if (entity.type === "divider") {
        return {
          type: "horizontalrule",
        };
      } else if (entity.type === "html") {
        return {
          type: entity.type,
          data: entity.data.htmlCode,
          config: entity.data.config,
        };
      } else if (entity.type === "TOKEN") {
        // why are we storing json as string instead of object
        return {
          type: entity.type,
          data: entity.data.texcontent,
        };
      } else if (entity.type === "media") {
        if (entity.data.original_link) {
          return {
            type: entity.type,
            data: getMediaUrl(entity.data?.original_link),
            config: { ...entity.data },
          };
        }
      } else if (entity.type === "image") {
        const { hyperlink, src, config } = entity.data;
        const { size } = config;
        delete config.size;

        return {
          type: entity.type,
          src: src,
          config: config,
          hyperlink: hyperlink,
          width: size.width,
          height: size.height,
          maxWidth: "inherit",
        };
      } else if (["form", "gallery", "testimonial"].includes(entity.type)) {
        return {
          type: entity.type,
          data: entity.data.data,
          config: entity.data.config,
        };
      }

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
function convertDraftToLexical(obj) {
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

  const draftContent = { ...obj };

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

  // shorten the keys to reduce file size
  if (SHORTEN) {
    return shortenKeys(root);
  }

  return root;
}

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
        colSpan: 1,
        rowSpan: 1,
        backgroundColor: rowIndex === 0 ? topRowColor : rowColor,
        headerState: rowIndex === 0 ? 3 : 0, // 3 for header, 0 for regular cell
        children: [
          {
            children: [
              {
                type: "text",
                // version: 1,
                text: cellText,
                // mode: "normal",
              },
            ],
          },
        ],
      })),
  }));

  return {
    type: "table",
    colWidths: Array(Object.keys(rows[0]).length - 1).fill(92), // Set column width for each column (minus the "id" column)
    children: tableRows,
  };
}

function convertListToLexical(block, entityMap, direction) {
  const listType = block.type === "unordered-list-item" ? "bullet" : "number";
  const listItem = {
    type: "listitem",
    children: mergeInlineStyles(
      block.text,
      block.inlineStyleRanges,
      block.entityRanges,
      entityMap
    ),
  };

  if (block?.data?.className) {
    listItem.className = block.data.className.replace(
      /ordered-list-|unordered-list-/,
      ""
    );
  }
  if (direction) {
    listItem.direction = direction;
  }

  return { listType, listItem, depth: block.depth };
}

const getMediaUrl = (url) => {
  if (!url || url?.length === 0) {
    return null;
  }

  // for youtube get the video id
  const match =
    /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/.exec(url);

  const id = match ? (match?.[2].length === 11 ? match[2] : null) : null;

  if (id != null) {
    return `https://www.youtube-nocookie.com/embed/${id}`;
  }

  // for other platform return the url as it is
  return url;
};

module.exports = {
  shortenKeys,
  expandKeys,
  mapBlockTypeToLexical,
  mapBlockTypeToFormat,
  mapBlockTypeToDirection,
  mapBlockTypeToIntent,
  extractLineHeight,
  convertDraftToLexical,
};
