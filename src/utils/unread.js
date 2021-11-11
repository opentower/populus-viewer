import Client from '../client.js'

export function calculateUnread(roomId) {
  const room = Client.client.getRoom(roomId)
  if (room) return room.getUnreadNotificationCount()
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
