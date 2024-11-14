// v1

const fs = require('fs');
const path = require('path');

// Read Draft.js JSON data from draft.json file
const draftFilePath = path.join(__dirname, 'draft.json');

let draftContentJSON;
try {
    const fileData = fs.readFileSync(draftFilePath, 'utf-8');
    draftContentJSON = JSON.parse(fileData);
} catch (error) {
    console.error('Error reading or parsing draft.json:', error);
    process.exit(1); // Exit if there's an error reading the file
}

const getStyle = (style) => {
    style = style.toLowerCase();
    if(!style) {
        return null;
    }

    if(['100','200','300','400','500','600','700','800','900'].includes(style)) {
        return `font-weight: ${style};`;
    }
    else if(style.startsWith('bg-')) {
        return `background: ${style};`;
    }
    else if(style.startsWith('rgba')) {
        return `color: ${style};`;
    }
   
    return style;
}

// Helper function to apply and merge inline styles accurately for overlapping ranges
function mergeInlineStyles(text, inlineStyleRanges) {
    // Initialize styleMap with a Set for each character position
    const styleMap = Array.from({ length: text.length }, () => new Set());

    // Apply each style range to the respective positions in the styleMap
    inlineStyleRanges.forEach(({ offset, length, style }) => {
        for (let i = offset; i < offset + length; i++) {
            if (styleMap[i]) {
                s = getStyle(style)
                styleMap[i].add(s); // Store styles in lowercase for consistency
            }
        }
    });

    const segments = [];
    let currentSegmentText = '';
    let currentSegmentStyles = Array.from(styleMap[0] || []); // Default to empty array if undefined

    // Build text segments with their associated styles
    for (let i = 0; i < text.length; i++) {
        const charStyles = Array.from(styleMap[i] || []);
        const char = text[i];

        // If the styles change at this character, push the current segment and start a new one
        if (JSON.stringify(charStyles) !== JSON.stringify(currentSegmentStyles)) {
            if (currentSegmentText) {
                segments.push({ text: currentSegmentText, style: currentSegmentStyles });
            }
            currentSegmentText = char;
            currentSegmentStyles = charStyles;
        } else {
            currentSegmentText += char;
        }
    }

    // Push the final segment
    if (currentSegmentText) {
        segments.push({ text: currentSegmentText, style: currentSegmentStyles });
    }

    return segments;
}

// Function to convert a Draft.js block to Lexical format
function convertBlockToLexical(block) {
    let type;
    switch (block.type) {
        case 'header-one':
            type = 'heading';
            break;
        case 'header-two':
            type = 'heading';
            break;
        default:
            type = 'paragraph';
    }

    // Process inline styles and merge overlapping/consecutive ranges
    const textNodes = mergeInlineStyles(block.text, block.inlineStyleRanges);

    return {
        type,
        textNodes,
        tag: type === 'heading' ? 'h1' : 'p' // Assign appropriate HTML tag for headings
    };
}

// Main function to convert Draft.js JSON to Lexical JSON
function convertDraftToLexical(draftContent) {
    return {
        root: draftContent.blocks.map(convertBlockToLexical)
    };
}

// Convert and output the result
const lexicalJSON = convertDraftToLexical(draftContentJSON);
console.log('Lexical JSON Output:', JSON.stringify(lexicalJSON));
