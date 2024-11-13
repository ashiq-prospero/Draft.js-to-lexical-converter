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
    process.exit(1);
}

// Corrected Map for Draft.js inline styles to Lexical `format` bitmask
const STYLE_BITMASK = {
    bold: 1,       // 1
    italic: 2,     // 2
    underline: 4,  // 4
    code: 8        // 8
};

// Helper function to calculate `format` bitmask from styles
function calculateFormatBitmask(styles) {
    return styles.reduce((bitmask, style) => {
        return bitmask | (STYLE_BITMASK[style] || 0);
    }, 0);
}

// Extracts inline CSS styles as a single string for Lexical
function extractStyleString(styles) {
    return styles
        .filter(style => !STYLE_BITMASK[style]) // Exclude `bold`, `italic`, etc., that are represented by `format`
        .join('; ');
}

// Helper function to apply and merge inline styles and handle link entities
function mergeInlineStyles(text, inlineStyleRanges, entityRanges, entityMap) {
    const styleMap = Array.from({ length: text.length }, () => new Set());
    const linkMap = Array(text.length).fill(null);

    inlineStyleRanges.forEach(({ offset, length, style }) => {
        for (let i = offset; i < offset + length; i++) {
            if (styleMap[i]) {
                styleMap[i].add(style.toLowerCase());
            }
        }
    });

    entityRanges.forEach(({ offset, length, key }) => {
        if (entityMap[key] && entityMap[key].type === 'LINK') {
            for (let i = offset; i < offset + length; i++) {
                linkMap[i] = key;
            }
        }
    });

    const segments = [];
    let currentSegmentText = '';
    let currentSegmentStyles = Array.from(styleMap[0] || []);
    let currentLinkKey = linkMap[0];

    for (let i = 0; i < text.length; i++) {
        const charStyles = Array.from(styleMap[i] || []);
        const charLinkKey = linkMap[i];
        const char = text[i];

        if (
            JSON.stringify(charStyles) !== JSON.stringify(currentSegmentStyles) ||
            charLinkKey !== currentLinkKey
        ) {
            if (currentSegmentText) {
                const segment = {
                    detail: 0,
                    format: calculateFormatBitmask(currentSegmentStyles),
                    mode: 'normal',
                    style: extractStyleString(currentSegmentStyles),
                    text: currentSegmentText,
                    type: 'text',
                    version: 1
                };

                if (currentLinkKey !== null) {
                    const linkEntity = entityMap[currentLinkKey];
                    segments.push({
                        children: [segment],
                        // ...segment,
                        direction: 'ltr',
                        format: '',
                        indent: 0,
                        type: 'link',
                        version: 1,
                        rel: 'noreferrer',
                        target: linkEntity.data.target || null,
                        title: linkEntity.data.title || null,
                        url: linkEntity.data.url || linkEntity.data.href || '',
                    });
                } else {
                    segments.push(segment);
                }
            }
            currentSegmentText = char;
            currentSegmentStyles = charStyles;
            currentLinkKey = charLinkKey;
        } else {
            currentSegmentText += char;
        }
    }

    if (currentSegmentText) {
        const segment = {
            text: currentSegmentText,
            format: calculateFormatBitmask(currentSegmentStyles),
            style: extractStyleString(currentSegmentStyles),
            detail: 0,
            mode: 'normal',
            type: 'text',
            version: 1
        };

        if (currentLinkKey !== null) {
            const linkEntity = entityMap[currentLinkKey];
            segments.push({
                ...segment,
                children: [segment],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'link',
                version: 1,
                url: linkEntity.data.url || linkEntity.data.href || '',
                rel: linkEntity.data.rel || '',
                target: linkEntity.data.target || null,
                title: linkEntity.data.title || null
            });
        } else {
            segments.push(segment);
        }
    }

    return segments;
}

// Updated `convertBlockToLexical` function to handle links
function convertBlockToLexical(block, entityMap) {
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

    const textNodes = mergeInlineStyles(block.text, block.inlineStyleRanges, block.entityRanges, entityMap);

    return {
        children: textNodes,
        direction: 'ltr',
        format: '',
        indent: 0,
        type,
        version: 1,
        textFormat: 1,
        textStyle: ''
    };
}

// Main function to convert Draft.js JSON to Lexical JSON and wrap it in `editorState`
function convertDraftToLexical(draftContent) {
    return {
        editorState: {
            root: {
                children: draftContent.blocks.map(block => convertBlockToLexical(block, draftContent.entityMap)),
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'root',
                version: 1
            }
        }
    };
}

// Convert and output the result
const lexicalJSON = convertDraftToLexical(draftContentJSON);
console.log('Lexical JSON Output:', JSON.stringify(lexicalJSON));
