export const pdfStateType = "com.open-tower.populus.pdf" // increment to start over with a fresh event type
export const lastViewed = "com.open-tower.populus.lastPositionViewed"
export const serverRoot = `https://conduit.m-e.pp.ua`
export const joinRule = "m.room.join_rules"
export const mscParent = "com.open-tower.msc3574.markup.parent"
export const mscResourceData = "com.open-tower.msc3574.markup.resource"
export const mscPdfHighlight = "com.open-tower.msc3592.markup.pdf.highlight"
export const mscMediaFragment = "com.open-tower.msc3775.markup.media.fragment"
export const mscPdfText = "com.open-tower.msc3592.markup.pdf.text"
export const mscLocation = "com.open-tower.msc3574.markup.location"
export const mscMarkupMsgKey = "com.open-tower.msc3574.markup"
export const populusHighlight = "com.open-tower.populus.markup.pdf.highlight"
export const populusCollectionChild = "com.open-tower.populus.collection_child"
export const populusWaveformPCM = "com.open-tower.populus.waveformPCM"

// based on https://github.com/matrix-org/matrix-react-sdk/blob/78b1f6c0b13efd57031a329a1ac62baba948dad3/src/HtmlUtils.tsx
const COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const transformTags = {
  // add blank targets to all hyperlinks except vector URLs
  a(tagName, attribs) {
    if (attribs.href) { attribs.target = '_blank'; }
    attribs.rel = 'noreferrer noopener'; // https://mathiasbynens.github.io/rel-noopener/
    return { tagName, attribs };
  },
  img(tagName) {
    // security for images is complicated, and they're not important for markdown right now.
    return { tagName, attribs: {}};
  },
  code(tagName, attribs) {
    if (typeof attribs.class !== 'undefined') {
      // Filter out all classes other than ones starting with language- for syntax highlighting.
      const classes = attribs.class.split(/\s/).filter((cl) => {
        return cl.startsWith('language-') && !cl.startsWith('language-_');
      });
      attribs.class = classes.join(' ');
    }
    return { tagName, attribs };
  },
  '*'(tagName, attribs) {
    // Delete any style previously assigned, style is an allowedTag for font and span
    // because attributes are stripped after transforming
    delete attribs.style;

    // Sanitise and transform data-mx-color and data-mx-bg-color to their CSS
    // equivalents
    const customCSSMapper = {
      'data-mx-color': 'color',
      'data-mx-bg-color': 'background-color'
    };

    let style = "";
    Object.keys(customCSSMapper).forEach((customAttributeKey) => {
      const cssAttributeKey = customCSSMapper[customAttributeKey];
      const customAttributeValue = attribs[customAttributeKey];
      if (customAttributeValue &&
                typeof customAttributeValue === 'string' &&
                COLOR_REGEX.test(customAttributeValue)
      ) {
        style += `${cssAttributeKey}:${customAttributeValue};`;
        delete attribs[customAttributeKey];
      }
    });

    if (style) { attribs.style = style; }

    return { tagName, attribs };
  }
};

export const sanitizeHtmlParams = {
  allowedTags: [
    'font', // custom to matrix for IRC-style font coloring
    'del', // for markdown
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol', 'sup', 'sub',
    'nl', 'li', 'b', 'i', 'u', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
    'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'span', 'img',
    'details', 'summary'
  ],
  allowedAttributes: {
    // custom ones first:
    font: ['color', 'data-mx-bg-color', 'data-mx-color', 'style'], // custom to matrix
    span: ['data-mx-maths', 'data-mx-bg-color', 'data-mx-color', 'data-mx-spoiler', 'style'], // custom to matrix
    div: ['data-mx-maths'],
    a: ['href', 'name', 'target', 'rel'], // remote target: custom to matrix
    img: ['src', 'width', 'height', 'alt', 'title'],
    ol: ['start'],
    code: ['class'] // We don't actually allow all classes, we filter them in transformTags
  },
  // Lots of these won't come up by default because we don't allow them
  selfClosing: ['img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta'],
  // URL schemes we permit
  allowedSchemes: ['http', 'https', 'ftp', 'mailto', 'magnet'],
  allowProtocolRelative: false,
  transformTags,
  // 50 levels deep "should be enough for anyone"
  nestingLimit: 50
};
