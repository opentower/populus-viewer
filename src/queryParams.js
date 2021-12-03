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
}
