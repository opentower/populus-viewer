import { serverRoot } from './constants.js'
import * as Matrix from 'matrix-js-sdk'

export default class Client {
  static async initClient () {
    let indexedDB
    try { indexedDB = window.indexedDB; } catch (e) {}
    const clientOpts = {
      baseUrl: serverRoot,
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
    return true
  }

  static restart () {
    Client.client.stopClient()
    Client.initClient()
  }
}
