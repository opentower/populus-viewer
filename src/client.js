import * as Matrix from 'matrix-js-sdk'

function getRoomWithState(roomId) {
  const checkForState = resolve => _ => {
    const room = this.getRoom(roomId)
    if (room) resolve(room)
    else setTimeout(checkForState(resolve), 500)
  }
  return new Promise(resolve => checkForState(resolve)())
}

function getHttpUriForMxcFromHS(...theArgs) {
  return Matrix.getHttpUriForMxc(`https://${this.getDomain()}`, ...theArgs)
}

export default class Client {
  static isResumable() {
    return !!localStorage.getItem('accessToken') &&
           !!localStorage.getItem('userId') &&
           !!localStorage.getItem('baseUrl')
  }

  static async initClient () {
    let indexedDB
    try { indexedDB = window.indexedDB; } catch (e) {}
    const clientOpts = {
      baseUrl: localStorage.getItem('baseUrl'),
      userId: localStorage.getItem('userId'),
      accessToken: localStorage.getItem('accessToken'),
      timelineSupport: true,
      unstableClientRelationAggregation: true
    }
    if (indexedDB) {
      console.log("using indexedDB")
      clientOpts.store = new Matrix.IndexedDBStore({
        indexedDB,
        localStorage,
        dbName: "populus-web-sync",
        workerScript: './indexeddb-worker.js'
      })
      await clientOpts.store.startup()
      Client.client = Matrix.createClient(clientOpts)
    } else {
      Client.client = Matrix.createClient(clientOpts)
    }
    Client.client.getRoomWithState = getRoomWithState.bind(Client.client)
    Client.client.getHttpUriForMxcFromHS = getHttpUriForMxcFromHS.bind(Client.client)
    return Client.client
  }

  static restart () {
    Client.client.stopClient()
    Client.client.store.deleteAllData()
    Client.initClient()
  }
}
