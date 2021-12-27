import * as Layout from "../layout.js"

export function textFromPdfSelection(sel) {
  const theRange = sel.getRangeAt(0)
  const theContents = Array.from(theRange.cloneContents().childNodes)
  return theContents.map(child =>
    child.nodeType === 3 // Text node
      ? child.data
      : child.nodeType === 1 // Element Node
        ? child.innerText
        : "" ).join(' ').replace(/(.)-\s+/g, "$1") // join nodes with spaces, clean any linebreak dashes
}

// get rects in coordinatates relative to the given elt, correcting for a css zoom originating at 0,0
export function rectsFromPdfSelection(sel, elt, zoom) {
  const theRange = sel.getRangeAt(0)
  return Layout.sanitizeRects(Array.from(theRange.getClientRects())
    .map(rect => Layout.rectRelativeTo(elt, rect, zoom)))
}
