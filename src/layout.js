//position an element at the given rectangle, where the rectangle is in coordinates relative to the viewport
export function positionAt(rect,elt) {

      var scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
	  var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      var parent = elt.offsetParent

      elt.style.left = rect.left + scrollLeft - parent.offsetLeft + "px"
      elt.style.top = rect.top + scrollTop - parent.offsetTop + "px"
      elt.style.height = rect.height + "px"
      elt.style.width = rect.width + "px"
}

export function positionRelativeAt(rect,elt) {

      var parent = elt.offsetParent

      elt.style.left = rect.left + parent.offsetLeft + "px"
      elt.style.top = rect.top + parent.offsetTop + "px"
      elt.style.height = rect.height + "px"
      elt.style.width = rect.width + "px"
}

//take boundingClientRect, in coordinates relative to the viewport, and produce
//a rect in coordinates relative to the given element
export function rectRelativeTo(elt,rect) {
    var eltRect = elt.getBoundingClientRect()
    return new DOMRect(rect.x - eltRect.x, rect.y - eltRect.y,rect.width,rect.height)
}

//take a rect in coordinates relative to the given element, and produce
//a boundingClientRect, in coordinates relative to the viewport
export function rectRelativeFrom(elt,rect) {
    var eltRect = elt.getBoundingClientRect()
    return new DOMRect(rect.x + eltRect.x, rect.y + eltRect.y,rect.width,rect.height)
}
