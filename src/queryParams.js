export default class QueryParameters {
  static parameters = new URLSearchParams(window.location.search)

  static get(a) {
    return QueryParameters.parameters.get(a)
  }

  static set(a, b) {
    QueryParameters.parameters.set(a, b)
  }

  static delete(a) {
    QueryParameters.parameters.delete(a)
  }

  static pushHistory(obj) {
    window.history.pushState(obj, '', `?${QueryParameters.parameters.toString()}`)
  }

  static replaceHistory(obj) {
    window.history.replaceState(obj, '', `?${QueryParameters.parameters.toString()}`)
  }
}
