export default class QuadPoints {
  static fromQuadArray([x1, y1, x2, y2, x3, y3, x4, y4]) {
    return new QuadPoints(x1, y1, x2, y2, x3, y3, x4, y4)
  }

  static fromRectIn(rect, elt, maybeDPI) {
    const dpi = maybeDPI || 72
    const scale = 72 / dpi
    const bottomLeftX = rect.x
    const bottomLeftY = elt.scrollHeight - rect.y - rect.height
    const topLeftX = rect.x
    const topLeftY = elt.scrollHeight - rect.y
    const topRightX = rect.x + rect.width
    const topRightY = elt.scrollHeight - rect.y
    const bottomRightX = rect.x + rect.width
    const bottomRightY = elt.scrollHeight - rect.y - rect.height
    return new QuadPoints(
      bottomLeftX * scale,
      bottomLeftY * scale,
      topLeftX * scale,
      topLeftY * scale,
      topRightX * scale,
      topRightY * scale,
      bottomRightX * scale,
      bottomRightY * scale
    )
  }

  constructor(x1, y1, x2, y2, x3, y3, x4, y4) {
    this.x1 = x1
    this.y1 = y1
    this.x2 = x2
    this.y2 = y2
    this.x3 = x3
    this.y3 = y3
    this.x4 = x4
    this.y4 = y4
  }

  toDOMRectInHeight(height, maybeDPI) {
    const dpi = maybeDPI || 72
    const scale = 72 / dpi
    const rect = this.getBoundingRect()
    return new DOMRect(
      rect.left * scale,
      (height - rect.top) * scale,
      (rect.right - rect.left) * scale,
      (rect.top - rect.bottom) * scale
    )
  }

  getArray() {
    return [this.x1, this.y1, this.x2, this.y2, this.x3, this.y3, this.x4, this.y4]
      .map(Math.round)
  }

  getBoundingRect() {
    return {
      left: Math.round(Math.min(this.x1, this.x2, this.x3, this.x4)),
      right: Math.round(Math.max(this.x1, this.x2, this.x3, this.x4)),
      top: Math.round(Math.max(this.y1, this.y2, this.y3, this.y4)),
      bottom: Math.round(Math.min(this.y1, this.y2, this.y3, this.y4))
    }
  }
}
