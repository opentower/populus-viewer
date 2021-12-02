import { createHashHistory } from 'history'
import { route } from 'preact-router'

export default class History {
  static history = createHashHistory()

  static message = {}

  static push(theRoute, message) {
    History.message = message || {}
    route(theRoute)
  }

  static replace(theRoute, message) {
    History.message = message || {}
    route(theRoute, true)
  }
}
