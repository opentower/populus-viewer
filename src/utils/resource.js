import * as Matrix from "matrix-js-sdk"
import Client from '../client.js'
import { pdfStateType, mscResourceData, populusWaveformPCM } from "../constants.js"

export default class Resource {
  static hasResource(theRoom) {
    const roomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const resourceContent = roomState.getStateEvents("m.room.create", "")?.getContent()?.[mscResourceData]
    const legacyMxc = roomState.getStateEvents(pdfStateType, "")?.getContent()?.mxc
    return !!(resourceContent || legacyMxc)
  }

  constructor(theRoom) {
    const roomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const legacyMxc = roomState.getStateEvents(pdfStateType, "")?.getContent()?.mxc

    const resourceContent = roomState.getStateEvents("m.room.create", "")?.getContent()?.[mscResourceData]

    this.file = resourceContent?.["m.file"]

    this.room = theRoom

    this.pcm = roomState.getStateEvents(populusWaveformPCM, "")?.getContent()?.mxc

    this.mimetype = resourceContent?.mimetype || this.file?.mimetype || "application/pdf"
    this.url = resourceContent?.url || this.file?.url || legacyMxc
    this.schema = this.url?.match(/^\w*/)[0]
    this.hasFetched = new Promise((resolve, reject) => {
      this.resolveFetch = resolve
      this.rejectFetch = reject
    })
  }

  get httpUrl() {
    if (this.schema === "mxc") return Client.client.getHttpUriForMxcFromHS(this.url)
    if (this.schema === "http") return this.url
    if (this.schema === "https") return this.url
    return null
  }
}
