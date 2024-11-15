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

module.exports = {
  mergeInlineStyles,
};
