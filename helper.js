const fontsList = require("./fonts");
const fonts = new Set([...fontsList]);

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
    format: calculateFormatBitmask(styles),
    mode: "normal",
    style: extractStyleString(styles),
    text,
    type: "text",
  };

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
const keyMapping = {
  format: "f",
  indent: "i",
  version: "v",
  children: "c",
  text: "t",
  style: "s",
};

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

module.exports = {
  mergeInlineStyles,
  shortenKeys,
  expandKeys,
  mapBlockTypeToLexical,
  mapBlockTypeToFormat,
  mapBlockTypeToDirection,
  mapBlockTypeToIntent,
  extractLineHeight,
};
