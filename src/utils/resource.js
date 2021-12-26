import * as Matrix from "matrix-js-sdk"
import Client from '../client.js'
import { pdfStateType, mscResourceData } from "../constants.js"

export default class Resource {
  constructor(theRoom) {
    const roomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const legacyMxc = roomState.getStateEvents(pdfStateType, "")?.getContent()?.mxc

    const resourceContent = roomState.getStateEvents("m.room.create", "").getContent()?.[mscResourceData]

    this.file = resourceContent?.["m.file"]

    this.mimetype = resourceContent?.mimetype || this.file?.mimetype || "application/pdf"
    this.url = resourceContent?.url || this.file?.url || legacyMxc
    this.schema = this.url?.match(/^\w*/)[0]
  }

  get httpUrl() {
    if (this.schema === "mxc") return Client.client.getHttpUriForMxcFromHS(this.url)
    return null
  }
}
