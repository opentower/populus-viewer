import Client from '../client.js'

export function calculateUnread(roomId) {
  const roomIfJoined = Client.client.getRoom(roomId)
  if (roomIfJoined) {
    const events = roomIfJoined.getLiveTimeline().getEvents()
    const maybeRead = roomIfJoined.getAccountData('m.fully_read')
    const currentFullyReadId = maybeRead ? maybeRead.getContent().event_id : null
    let receiptIndex = 0
    // TODO It'd probably be smarter to start at the most recent and decrement
    // the counter, rather than what we're doing now
    if (currentFullyReadId) {
      for (let i = 0; i < events.length; ++i) {
        if (currentFullyReadId === events[i].getId()) {
          receiptIndex = ++i
          break
        }
      }
    }
    const unreadEvents = events.slice(receiptIndex).filter(e => e.getType() === 'm.room.message')
    return unreadEvents.length
  }
  return "All"
}

export function isUnread(event) {
  const roomIfJoined = Client.client.getRoom(event.getRoomId())
  if (roomIfJoined) {
    const events = roomIfJoined.getLiveTimeline().getEvents()
    const maybeRead = roomIfJoined.getAccountData('m.fully_read')
    const currentFullyReadId = maybeRead ? maybeRead.getContent().event_id : null
    if (currentFullyReadId) {
      for (let i = (events.length - 1); i >= 0; --i) {
        if (currentFullyReadId === events[i].getId()) return false
        if (event.getId() === events[i].getId()) return true
      }
    }
  }
  return true
}
