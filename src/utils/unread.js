import Client from '../client.js'

export function calculateUnread(roomId) {
  const roomIfJoined = Client.client.getRoom(roomId)
  if (roomIfJoined) {
    const events = roomIfJoined.getLiveTimeline().getEvents()
    const maybeRead = roomIfJoined.getAccountData('m.fully_read')
    const currentFullyReadId = maybeRead ? maybeRead.getContent().event_id : null
    let receiptIndex = 0
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
