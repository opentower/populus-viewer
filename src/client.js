import { serverRoot } from './constants.js'
import * as Matrix from 'matrix-js-sdk'

export default class Client {
  static client = Matrix.createClient({
    baseUrl: serverRoot,
    userId: localStorage.getItem('userId'),
    accessToken: localStorage.getItem('accessToken'),
    timelineSupport: true,
    unstableClientRelationAggregation: true
  })

  static restart () {
    Client.client.stopClient()
    Client.client = Matrix.createClient({
      baseUrl: serverRoot,
      timelineSupport: true
    })
  }
}
