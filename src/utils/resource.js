import * as Matrix from "matrix-js-sdk"
import Client from '../client.js'
import { pdfStateType } from "../constants.js"

export default class Resource {
  constructor(theRoom) {
    this.room = theRoom

    this.legacyMxc = this.room
      .getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
      .getStateEvents(pdfStateType, "")
      ?.getContent()?.mxc

    this.url = this.legacyMxc
    this.schema = this.url.match(/^\w*/)[0]
  }

  mimetype = "application/pdf"

  get httpUrl() {
    if (this.schema === "mxc") return Client.client.getHttpUriForMxcFromHS(this.url)
    return null
  }
}
