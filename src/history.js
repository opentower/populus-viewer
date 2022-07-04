import { createHashHistory } from 'history'
import { route } from 'preact-router'

export default class History {
  static history = createHashHistory()

  static message = {}

  static push(theRoute, message) {
    // the second argument means we only push if we're not already at the path
    // in question. Otherwise we replace.
    route(theRoute, this.history.location.pathname == theRoute)
    this.history.replace(theRoute, message)
  }

  static replace(theRoute, message) {
    route(theRoute, true)
    this.history.replace(theRoute, message)
  }

  static setPath(componentNumber, value) {
    const pathparts = this.history.location.pathname.split("/")
    pathparts[componentNumber] = value
    History.push(pathparts.join("/"))
  }
}
