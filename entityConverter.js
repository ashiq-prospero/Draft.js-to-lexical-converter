const { mergeInlineStyles } = require("./helper");

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
                version: 1,
                text: cellText,
                mode: "normal",
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

module.exports = {
  convertTableEntityToLexical,
  convertListToLexical,
};
