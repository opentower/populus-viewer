export function positionRelativeAt(rect, elt, zoomFactor) {
  const parent = elt.offsetParent

  elt.style.left = `${rect.left - (parent.offsetLeft / zoomFactor)}px`
  elt.style.top = `${rect.top - (parent.offsetTop / zoomFactor)}px`
  elt.style.height = `${rect.height}px`
  elt.style.width = `${rect.width}px`
}

// take boundingClientRect, in coordinates relative to the viewport,
// with a factor for a CSS transform originating at 0,0 and produce
// a rect in coordinates relative to the given element
export function rectRelativeTo(elt, rect, zoomFactor) {
  const eltRect = elt.getBoundingClientRect()
  return new DOMRect(
    (rect.x - eltRect.x) / zoomFactor,
    (rect.y - eltRect.y) / zoomFactor,
    rect.width / zoomFactor,
    rect.height / zoomFactor
  )
}

// take an array of rects and sanitize them, 
// - removing zero width artifacts, and padding width
// TODO: fuse relevantly overlapping rects
export function sanitizeRects(rects) {
  return rects.filter(rect => rect.width > 1).map(rect => {
    rect.x = rect.x - 5
    rect.width = rect.width + 10
    return rect
  })
}

// take an array of rects and return the minimal rect containing all of them
export function unionRects(rects) {
  const xs = rects.map(rect => rect.x)
  const ys = rects.map(rect => rect.y)
  const rights = rects.map(rect => rect.right)
  const bottoms = rects.map(rect => rect.bottom)
  const theX = Math.min(...xs)
  const theY = Math.min(...ys)
  return new DOMRect(theX, theY, Math.max(...rights) - theX, Math.max(...bottoms) - theY)
}
