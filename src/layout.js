export function matchSize(rect,elt) {

      var parent = elt.offsetParent

      elt.style.height = rect.height + "px"
      elt.style.width = rect.width + "px"
}

export function positionRelativeAt(rect,elt,zoomFactor) {

      var parent = elt.offsetParent

      elt.style.left = rect.left - (parent.offsetLeft / zoomFactor) + "px"
      elt.style.top = rect.top - (parent.offsetTop / zoomFactor) + "px"
      elt.style.height = rect.height + "px"
      elt.style.width = rect.width + "px"
}

//take boundingClientRect, in coordinates relative to the viewport, 
//with a factor for a CSS transform originating at 0,0 and produce
//a rect in coordinates relative to the given element
export function rectRelativeTo(elt,rect,zoomFactor) {
    var eltRect = elt.getBoundingClientRect()
    return new DOMRect(
        (rect.x - eltRect.x) / zoomFactor, 
        (rect.y - eltRect.y) / zoomFactor, 
        rect.width / zoomFactor,
        rect.height / zoomFactor 
    )
}

//take a rect in coordinates relative to the given element, and produce
//a boundingClientRect, in coordinates relative to the viewport
export function rectRelativeFrom(elt,rect) {
    var eltRect = elt.getBoundingClientRect()
    return new DOMRect(rect.x + eltRect.x, rect.y + eltRect.y,rect.width,rect.height)
}
