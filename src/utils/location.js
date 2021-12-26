import Client from '../client.js'
import { eventVersion, mscLocation } from "../constants.js"

export default class Location {
  constructor(theEvent) {
    this.event = theEvent
    this.location = this.event.getContent()[mscLocation]?.[eventVersion] ||
      this.event.getContent()[eventVersion]
  }

  getUnread() {
    const room = Client.client.getRoom(this.event.getStateKey())
    if (room) return room.getUnreadNotificationCount()
    return "All"
  }

  getRoomId() {
    return this.event.getStateKey()
  }
}
