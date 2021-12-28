import Client from '../client.js'
import { eventVersion, spaceParent, spaceChild, mscLocation } from "../constants.js"

export default class Location {
  constructor(theEvent) {
    this.event = theEvent
    this.location = this.event.getContent()[mscLocation]?.[eventVersion] ||
      this.event.getContent()[eventVersion]
  }

  getUnread() {
    const room = Client.client.getRoom(this.getChild())
    if (room) return room.getUnreadNotificationCount()
    return "All"
  }

  getParent() {
    if (this.event.getType() === spaceParent) return this.event.getStateKey()
    if (this.event.getType() === spaceChild) return this.event.getRoomId()
  }

  getChild() {
    if (this.event.getType() === spaceParent) return this.event.getRoomId()
    if (this.event.getType() === spaceChild) return this.event.getStateKey()
  }
}
