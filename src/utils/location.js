import Client from '../client.js'
import * as Matrix from "matrix-js-sdk"
import { mscLocation, populusHighlight, mscPdfText, mscPdfHighlight, mscMediaFragment, mscMarkupMsgKey, mscParent } from "../constants.js"

export default class Location {
  constructor(theEvent) {
    this.event = theEvent
    this.location = this.event.getContent()[mscLocation] ||
      this.event.getContent()[mscMarkupMsgKey]?.[mscLocation]
  }

  isValid() {
    if (!this.location) return false
    if (!this.getStatus()) return false
    if (!this.getCreator()) return false
    // if (!this.getType()) return false
    return true
  }

  getUnread() {
    const room = Client.client.getRoom(this.getChild())
    if (room) return room.getUnreadNotificationCount()
    return "All"
  }

  getVia() {
    return this.event.getContent().via
  }

  isQuestion() {
    if (this.location?.motivation === "questioning") return true
    return false
  }

  getType() {
    if (this.location?.[mscPdfHighlight]) return "highlight"
    if (this.location?.[mscPdfText]) return "text"
    if (this.location?.[mscMediaFragment]) return "media-fragment"
    return null
  }

  getOrientation() {
    if (this.event.getType() === Matrix.EventType.SpaceParent) return "parent"
    if (this.event.getType() === Matrix.EventType.SpaceChild) return "child"
  }

  getParent() {
    if (this.event.getType() === Matrix.EventType.SpaceParent) return this.event.getStateKey()
    if (this.event.getType() === Matrix.EventType.SpaceChild) return this.event.getRoomId()
    if (this.event.getType() === "m.room.message") {
      return this.event.getContent()[mscMarkupMsgKey]?.[mscParent]
    }
  }

  getChild() {
    if (this.event.getType() === Matrix.EventType.SpaceParent) return this.event.getRoomId()
    if (this.event.getType() === Matrix.EventType.SpaceChild) return this.event.getStateKey()
    if (this.event.getType() === "m.room.message") return this.event.getRoomId()
  }

  getResourcePosition() {
    if (this.location?.[mscPdfHighlight]) return this.getPageIndex()
    if (this.location?.[mscPdfText]) return this.getPageIndex()
    if (this.location?.[mscMediaFragment]) return Math.floor(this.getIntervalStart() / 1000)
  }

  getResourceFragment() {
    if (this.location?.[mscMediaFragment]) {
      const temporal = this.location[mscMediaFragment].start || this.location[mscMediaFragment].start
        ? `t=${this.getIntervalStart() / 1000},${this.getIntervalEnd() / 1000}`
        : ""
      const spatial = this.location[mscMediaFragment].x
        ? `xywh=${this.location[mscMediaFragment].x},${
          this.location[mscMediaFragment].y},${
          this.location[mscMediaFragment].w},${
          this.location[mscMediaFragment].h}`
        : ""
      if (temporal) {
        if (spatial) {
          return `${temporal}&${spatial}`
        } return temporal
      } else return spatial
    }
  }

  //PDF specific

  getText() {
    return this.location?.[mscPdfHighlight]?.text_content
  }

  getPageIndex() {
    return this.location?.[mscPdfHighlight]?.page_index ||
      this.location?.[mscPdfText]?.page_index
  }

  getRect() {
    return this.location?.[mscPdfHighlight]?.rect ||
      this.location?.[mscPdfText]?.rect
  }

  getQuadPoints() {
    return this.location?.[mscPdfHighlight]?.quad_points
  }

  //Media specific

  getIntervalStart() {
    if (this.location[mscMediaFragment]) {
      return this.location[mscMediaFragment].start || 0
    }
  }

  getIntervalEnd() {
    if (this.location[mscMediaFragment]) {
      return this.location[mscMediaFragment].end || "end"
    }
  }

  getMediaRect() {
    if (this.location[mscMediaFragment] &&
      this.location[mscMediaFragment].x &&
      this.location[mscMediaFragment].y &&
      this.location[mscMediaFragment].w &&
      this.location[mscMediaFragment].h 
    ) { return new DOMRect(
        this.location[mscMediaFragment].x,
        this.location[mscMediaFragment].y,
        this.location[mscMediaFragment].w,
        this.location[mscMediaFragment].h
      )
    }
  }

  // populus specific methods

  isPrivate() {
    if (this.location?.[populusHighlight]?.private) return true
    return false
  }

  getRootContent() {
    return this.location?.[populusHighlight]?.rootContent
  }

  getCreator() {
    return this.location?.[populusHighlight]?.creator
  }

  getStatus() {
    return this.location?.[populusHighlight]?.activityStatus
  }
}
