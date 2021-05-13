export default class QueryParameters {
  static tryInit () {
    if (!QueryParameters.parameters) QueryParameters.parameters = new URLSearchParams(window.location.search)
  }

  static get(a) {
    QueryParameters.tryInit()
    return QueryParameters.parameters.get(a)
  }

  static set(a, b) {
    QueryParameters.tryInit()
    QueryParameters.parameters.set(a, b)
  }

  static delete(a) {
    QueryParameters.tryInit()
    QueryParameters.parameters.delete(a)
  }

  static pushHistory(obj) {
    QueryParameters.tryInit()
    window.history.pushState(obj, '', `?${QueryParameters.parameters.toString()}`)
  }

  static replaceHistory(obj) {
    QueryParameters.tryInit()
    window.history.replaceState(obj, '', `?${QueryParameters.parameters.toString()}`)
  }
}
