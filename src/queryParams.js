export default class QueryParameters {
  static parameters = new URLSearchParams(window.location.search)

  static get(a) {
    return QueryParameters.parameters.get(a)
  }

  static refresh() {
    QueryParameters.parameters = new URLSearchParams(window.location.search)
  }

  static set(a, b) {
    QueryParameters.parameters.set(a, b)
  }

  static delete(a) {
    QueryParameters.parameters.delete(a)
  }

  static pushHistory(obj) {
    const oldState = window.history.state || {}
    const newState = Object.assign(oldState, obj) // overwrite old state with new additions
    window.history.pushState(newState, '', `?${QueryParameters.parameters.toString()}`)
  }

  static replaceHistory(obj) {
    const oldState = window.history.state || {}
    const newState = Object.assign(oldState, obj) // overwrite old state with new additions
    window.history.replaceState(newState, '', `?${QueryParameters.parameters.toString()}`)
  }
}
