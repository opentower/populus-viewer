import { h, createRef, Component } from 'preact';
import AnnotationLayer from "./annotation.js"
import Client from './client.js'
import PdfCanvas from "./pdfCanvas.js"
import QuadPoints from "./utils/quadPoints.js"
import * as Matrix from "matrix-js-sdk"
import { unionRects } from "./utils/layout.js"
import { onlineOrAlert } from "./utils/alerts.js"
import { textFromPdfSelection, rectsFromPdfSelection } from './utils/selection.js'
import { mscLocation, mscPdfText, mscPdfHighlight, populusHighlight } from "./constants.js"

export default class PdfPage extends Component {
  constructor(props) {
    super(props)
    this.state = { pdfFitRatio: 1 }
    this.pdfScale = 3
    // single source of truth for PDF scale, pdfcanvas w/h are pdf dimensions (in userspace units) times scale
  }

  textLayer = createRef()

  annotationLayer = createRef()

  annotationLayerWrapper = createRef()

  hasSelection() {
    return !window.getSelection().isCollapsed &&
      this.textLayer.current.contains(window.getSelection().getRangeAt(0).endContainer) &&
      this.textLayer.current.contains(window.getSelection().getRangeAt(0).startContainer)
  }

  isTarget = e => e.target === this.annotationLayer.current.base

  setPdfFitRatio = pdfFitRatio => this.setState({pdfFitRatio})

  generateLocation = sel => {
    const theSelectedText = textFromPdfSelection(sel)
    const clientRects = rectsFromPdfSelection(sel, this.annotationLayerWrapper.current, this.state.pdfFitRatio * this.props.zoomFactor)
    const boundingClientRect = unionRects(clientRects)
    const clientQuads = clientRects.map(rect => QuadPoints.fromRectIn(rect, this.annotationLayerWrapper.current))
    const boundingQuad = QuadPoints.fromRectIn(boundingClientRect, this.annotationLayerWrapper.current)
    // ↑ We've set the dimensions of the text layer in such a way that it's 72dpi, scaled up with a CSS transform.
    // So we can omit the DPI parameter here.
    return {
      [mscPdfHighlight]: {
        page_index: this.props.pageFocused,
        rect: boundingQuad.getBoundingRect(),
        quad_points: clientQuads.map(quad => quad.getArray()),
        contents: "", // highlight contents, per PDF spec. Fill this with the first chat message text, or fallback text
        text_content: theSelectedText // the actual highlighted text
      },
      [populusHighlight]: {
        activityStatus: "pending",
        creator: Client.client.getUserId()
      }
    }
  }

  commitHighlight = _ => {
    if (!onlineOrAlert()) return
    const theSelection = window.getSelection()
    if (theSelection.isCollapsed) return
    const theSelectedText = textFromPdfSelection(theSelection)
    // ↑ We've set the dimensions of the text layer in such a way that it's 72dpi, scaled up with a CSS transform.
    // So we can omit the DPI parameter here.
    const theDomain = Client.client.getDomain()
    const theRoomState = this.props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theLevels = theRoomState.getStateEvents("m.room.power_levels")
    const locationData = this.generateLocation(theSelection)
    // TODO: we should set room_alias_name and name, in a useful way based on the selection
    return Client.client.createRoom({
      visibility: "private",
      name: `виділений фрагмент на сторінці ${this.props.pageFocused}`,
      power_level_content_override: {
        users: Object.assign({}, theLevels[0].getContent().users, {
          [Client.client.getUserId()]: 100
        })
      },
      topic: theSelectedText,
      initial_state: [{
        type: "m.room.join_rules",
        state_key: "",
        content: {join_rule: "public"}
      },
      {
        type: Matrix.EventType.SpaceParent, // we indicate that the current room is the parent
        content: { via: [theDomain], [mscLocation]: locationData },
        state_key: this.props.room.roomId
      }
      ]
    }).then(roominfo => {
      // set child event in pdfRoom State
      theSelection.removeAllRanges()
      const childContent = { via: [theDomain], [mscLocation]: locationData }
      // We focus on a new fake placeholder event to insert the highlight immediately
      const fakeEvent = new Matrix.MatrixEvent({
        type: "m.space.child",
        origin_server_ts: new Date().getTime(),
        room_id: this.props.room.roomId,
        sender: Client.client.getUserId(),
        state_key: roominfo.room_id,
        content: childContent
      })
      Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.SpaceChild, childContent, roominfo.room_id)
      return fakeEvent
    })
  }

  commitPin = (theX, theY) => {
    if (!onlineOrAlert()) return
    const theDomain = Client.client.getDomain()
    const theRoomState = this.props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theLevels = theRoomState.getStateEvents("m.room.power_levels")
    const newY = this.annotationLayerWrapper.current.scrollHeight - theY
    const locationData = {
      [mscPdfText]: {
        page_index: this.props.pageFocused,
        rect: {
          left: theX,
          right: theX + 10,
          top: newY,
          bottom: newY - 10
        },
        name: "Comment",
        contents: "" // highlight contents, per PDF spec. TODO Fill this with the first chat message text, or fallback text
      },
      [populusHighlight]: {
        activityStatus: "pending",
        creator: Client.client.getUserId()
      }
    }
    return Client.client.createRoom({
      visibility: "private",
      name: `pindrop on page ${this.props.pageFocused}`,
      power_level_content_override: {
        users: Object.assign({}, theLevels[0].getContent().users, {
          [Client.client.getUserId()]: 100
        })
      },
      initial_state: [{
        type: "m.room.join_rules",
        state_key: "",
        content: {join_rule: "public"}
      },
      {
        type: Matrix.EventType.SpaceParent, // we indicate that the current room is the parent
        content: {
          via: [theDomain],
          [mscLocation]: locationData
        },
        state_key: this.props.room.roomId
      }
      ]
    }).then(roominfo => {
      // set child event in pdfRoom State
      const childContent = {
        via: [theDomain],
        [mscLocation]: locationData
      }
      const fakeEvent = new Matrix.MatrixEvent({
        type: "m.space.child",
        origin_server_ts: new Date().getTime(),
        room_id: this.props.room.roomId,
        sender: Client.client.getUserId(),
        state_key: roominfo.room_id,
        content: childContent
      })
      Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.SpaceChild, childContent, roominfo.room_id)
      return fakeEvent
    }).catch(e => alert(e))
  }

  render(props, state) {
    const dynamicDocumentStyle = {
      "--pdfFitRatio": state.pdfFitRatio,
      "--pdfWidthPx": `${props.pdfWidthPx}px`,
      "--pdfHeightPx": `${props.pdfHeightPx}px`
    }
    return <div class="page-wrapper" style={dynamicDocumentStyle}>
      <PdfCanvas
        setPdfDimensions={props.setPdfDimensions}
        setPdfFitRatio={this.setPdfFitRatio}
        pdfScale={this.pdfScale}
        annotationLayer={this.annotationLayer}
        hasFetched={props.hasFetched}
        pdfPromise={props.pdfPromise}
        textLayer={this.textLayer}
        searchString={props.searchString}
        pageFocused={props.pageFocused}
        setPdfLoadingStatus={props.setPdfLoadingStatus}
      />
      <AnnotationLayer
        ref={this.annotationLayer}
        pindropMode={props.pindropMode}
        annotationLayerWrapper={this.annotationLayerWrapper}
        filteredAnnotationContents={props.filteredAnnotationContents}
        pdfWidthAdjustedPx={props.pdfWidthPx / state.pdfFitRatio}
        pdfHeightAdjustedPx={props.pdfHeightPx / state.pdfFitRatio}
        fixedSide={props.fixedSide}
        zoomFactor={props.zoomFactor}
        pageFocused={props.pageFocused}
        roomId={props.room.roomId}
        setFocus={props.setFocus}
        focus={props.focus}
        secondaryFocus={props.secondaryFocus}
      />
    </div>
  }
}
