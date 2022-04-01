import * as Layout from "./layout.js"

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

// get rects in CSS pixel coordinatates relative to the given elt, correcting for a css zoom originating at 0,0
export function rectsFromPdfSelection(sel, elt, zoom) {
  const theRange = sel.getRangeAt(0)
  let rects = []
  if (theRange.startContainer !== theRange.endContainer) {
    if (theRange.startContainer.nodeType === 1) { // starts in an element
      const startRangeChildren = Array.from(theRange.startContainer.childNodes).slice(theRange.startOffset)
      const startRangeChildrenText = startRangeChildren.map(gatherTextNodesBelow).reduce((acc, next) => acc.concat(next), [])
      rects = rects.concat(startRangeChildrenText.map(node => textNodeToRect(node)))
    }
    if (theRange.startContainer.nodeType === 3) { // starts in a text element
      rects.push(textNodeToRect(theRange.startContainer, theRange.startOffset))
    }
    if (theRange.endContainer.nodeType === 1) { // ends in an element
      const endRangeChildren = Array.from(theRange.endContainer.childNodes).slice(0, theRange.endOffset)
      const endRangeChildrenText = endRangeChildren.map(gatherTextNodesBelow).reduce((acc, next) => acc.concat(next), [])
      rects = rects.concat(endRangeChildrenText.map(node => textNodeToRect(node)))
    }
    if (theRange.endContainer.nodeType === 3 && theRange.endOffset > 0) { // ends in a text element
      rects.push(textNodeToRect(theRange.endContainer, 0, theRange.endOffset))
    }
    rects = rects.concat(gatherTextNodesBetween(theRange.startContainer, theRange.endContainer).map(node => textNodeToRect(node)))
  } else {
    if (theRange.startContainer.nodeType === 1) { // starts and ends in an element
      const startRangeChildren = Array.from(theRange.startContainer.childNodes).slice(theRange.startOffset, theRange.endOffset)
      const startRangeChildrenText = startRangeChildren.map(gatherTextNodesBelow).reduce((acc, next) => acc.concat(next), [])
      rects = rects.concat(startRangeChildrenText.map(node => textNodeToRect(node)))
    }
    if (theRange.startContainer.nodeType === 3) { // starts and ends in a text element
      rects.push(textNodeToRect(theRange.startContainer, theRange.startOffset, theRange.endOffset))
    }
  }
  return Layout.sanitizeRects(rects.map(rect => Layout.rectRelativeTo(elt, rect, zoom)))
}

// find the next (inclusive) node satisfying predicate in the DOM, in a preorder traversal.
//
// Note, JS generally doesn't have tail call optimization, so maybe we should
// use a trampoline here to prevent stack overflow someday.
//
// cf https://stackoverflow.com/questions/54719548/tail-call-optimization-implementation-in-javascript-engines
function findNextInDOM(node, predicate, ascending) {
  if (ascending) {
    if (node.nextSibling) return findNextInDOM(node.nextSibling, predicate)
    if (node.parentNode) return findNextInDOM(node.parentNode, predicate, true)
    return null
  }
  if (predicate(node)) return node
  if (node.firstChild) return findNextInDOM(node.firstChild, predicate)
  if (node.nextSibling) return findNextInDOM(node.nextSibling, predicate)
  if (node.parentNode) return findNextInDOM(node.parentNode, predicate, true)
  return null
}

// gather the text nodes below a given node, inclusive
function gatherTextNodesBelow(top) {
  const nodes = []
  const predicate = node => node.nodeType === 3 || node === top
  let focus = findNextInDOM(top, predicate)
  if (focus === top) return [top] // if top is a text node
  nodes.push(focus)
  while ((focus = findNextInDOM(focus, predicate, true)) !== top) {
    nodes.push(focus)
  }
  return nodes
}

// gather the text nodes in between start and end (excluding both start and end)
function gatherTextNodesBetween(start, end) {
  const nodes = []
  const predicate = node => node.nodeType === 3 || node === end
  let focus = start
  while ((focus = findNextInDOM(focus, predicate, true)) !== end) {
    nodes.push(focus)
  }
  return nodes
}

function textNodeToRect(textNode, start, end) {
  const range = document.createRange();
  range.selectNode(textNode);
  if (start) range.setStart(textNode, start)
  if (end) range.setEnd(textNode, end)
  return range.getBoundingClientRect();
}
