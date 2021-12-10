import { h, createRef, Component } from 'preact';
import * as Layout from "./layout.js"
import * as Matrix from "matrix-js-sdk"
import { eventVersion, spaceChild } from "./constants.js"
import UserColor from "./userColors.js"
import Client from './client.js'
import './styles/annotation-layer.css'
import * as Icons from './icons.js'

export default class AnnotationLayer extends Component {
  constructor(props) {
    super(props)
    this.state = {typing: {}}
    this.handleTypingNotification = this.handleTypingNotification.bind(this)
  }

  componentDidMount() {
    Client.client.on("RoomMember.typing", this.handleTypingNotification)
  }

  componentDidUnmount () {
    Client.client.off("RoomMember.typing", this.handleTypingNotification)
  }

  handleTypingNotification = (event, member) => {
    const theRoomState = Client.client.getRoom(this.props.roomId).getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theChildRelation = theRoomState.getStateEvents(spaceChild, member.roomId)
    // We use nested state here because we want to pass this part of the state to a child
    if (theChildRelation) {
      this.setState(prevState => {
        const myId = Client.client.getUserId()
        const typingOtherThanMe = event.getContent().user_ids.filter(x => x !== myId)
        return {typing: { ...prevState.typing, [member.roomId]: typingOtherThanMe}}
      })
    }
  }

  filterAnnotations (data) {
    return (
      !!data && // filter out old eventVersions
      data.pageNumber === parseInt(this.props.page, 10) &&
      ( data.activityStatus === "open" ||
        (data.activityStatus === "pending" && data.creator === Client.client.getUserId())
      )
    )
  }

  getAnnotations() {
    const theRoom = Client.client.getRoom(this.props.roomId)
    const roomId = this.props.focus ? this.props.focus.roomId : null
    let annotations = []
    if (theRoom) {
      // We filter to include only the annotations on the page
      const annotationData = this.props.filteredAnnotationContents
        .filter(content =>
          this.filterAnnotations(content[eventVersion]) &&
          // We omit the focused annotation, since we're going to add it back in and don't want to double-count.
          (this.props.focus ? content[eventVersion].roomId !== this.props.focus.roomId : true)
        )
        .map(content => content[eventVersion])
      // We add the focus back in if it's on the page
      if (this.props.focus && this.filterAnnotations(this.props.focus)) annotationData.push(this.props.focus)
      // We turn the array into annontation components
      annotations = annotationData.map(data => {
        switch (data.type) {
          case 'pindrop': return <Pindrop
            key={data.roomId}
            focused={roomId === data.roomId}
            typing={this.state.typing[data.roomId]}
            setFocus={this.props.setFocus}
            data={data} />
          // default for legacy reasons, could switch to highlight in 2022
          default: return <Annotation
            zoomFactor={this.props.zoomFactor}
            key={data.roomId}
            focused={roomId === data.roomId}
            typing={this.state.typing[data.roomId]}
            setFocus={this.props.setFocus}
            pdfWidthAdjusted={this.props.pdfWidthAdjusted}
            rightSide={data.roomId.charCodeAt(1) % 2 === 1 }
            data={data} />
        }
      })
    }
    return annotations
  }

  render(props) {
    return (
      <div
        ref={props.annotationLayerWrapper}
        id="annotation-layer">
        {this.getAnnotations()}
        {props.pindropMode?.x ? <PindropPreview data={props.pindropMode} /> : null}
      </div>
    )
  }
}

function PindropPreview (props) {
  const style = {
    left: `${props.data.x}px`,
    top: `${props.data.y}px`
  }
  return <span
    class="annotation-pindrop annotation-pindrop-preview"
    data-annotation
    style={style}>
    {Icons.pin}
  </span>
}

class Pindrop extends Component {
  setFocus = _ => this.props.setFocus(this.props.data)

  userColor = new UserColor(this.props.data.creator)

  style = {
    left: `${this.props.data.x}px`,
    top: `${this.props.data.y}px`,
    ...this.userColor.styleVariables
  }
  // we add a slight 15px offset to have it line up more with the cursor

  render(props) {
    const typing = typeof (props.typing) === "object" && Object.keys(props.typing).length > 0 ? true : null
    return <span
      onclick={this.setFocus}
      class="annotation-pindrop"
      data-focused={props.focused}
      data-annotation-typing={typing}
      data-annotation
      style={this.style}>
      {Icons.pin}
    </span>
  }
}

class Annotation extends Component {
  setFocus = _ => { this.props.setFocus(this.props.data) }

  eventContent = this.props.data

  roomId = this.eventContent.roomId

  boundingRect = JSON.parse(this.eventContent.boundingClientRect)

  userColor = new UserColor(this.eventContent.creator)

  render(props) {
    // This is recalculated with every render. Could be memoized on pdfWidthAdjusted
    const spans = JSON.parse(this.eventContent.clientRects).map(
      rect => <RectSpan pdfWidthAdjusted={this.props.pdfWidthAdjusted} key={rect} zoomFactor={this.props.zoomFactor} setFocus={this.setFocus} rect={rect} />
    )
    const typing = typeof (props.typing) === "object" && Object.keys(props.typing).length > 0 ? true : null
    return <div style={this.userColor.styleVariables} data-annotation-typing={typing} data-focused={props.focused} id={this.roomId}>
      <BarTab
        pdfWidthAdjusted={props.pdfWidthAdjusted}
        rightSide={props.rightSide}
        rect={this.boundingRect}
        zoomFactor={props.zoomFactor}
        setFocus={this.setFocus} />
      <div class="inline-annotations">
        {spans}
      </div>
    </div>
  }
}

class BarTab extends Component {
  constructor(props) {
    super(props)
    this.state = {
      overlapOffset: 0
    }
  }

  componentDidMount() {
    Layout.positionRelativeAt(this.getTabRect(), this.ref.current, 1)
    this.scootch()
  }

  componentDidUpdate() {
    Layout.positionRelativeAt(this.getTabRect(), this.ref.current, this.props.zoomFactor)
    this.scootch()
  }

  ref = createRef()

  getTabRect = _ => {
    return this.props.rightSide
      ? new DOMRect(this.props.pdfWidthAdjusted - 10 + this.state.overlapOffset, this.props.rect.y, 5, this.props.rect.height)
      : new DOMRect(5 - this.state.overlapOffset, this.props.rect.y, 5, this.props.rect.height)
  }

  scootch = _ => {
    const rect = this.ref.current.getBoundingClientRect()
    const overlaps = document.elementsFromPoint(rect.x + 1, rect.y + 1)
      .filter(elt => {
        const eltRect = elt.getBoundingClientRect()
        const isAnnot = elt.className === "annotation-bartab"
        const isPrior = elt.compareDocumentPosition(this.ref.current) === 4
        return (isAnnot && ((eltRect.y < rect.y) || (isPrior && eltRect.y === rect.y)))
      })
    if (overlaps.length > 0) {
      this.setState({overlapOffset: this.state.overlapOffset + 10})
    }
  }

  render(props) {
    return <span
      onclick={props.setFocus}
      class="annotation-bartab"
      data-annotation
      ref={this.ref}
    />
  }
}

class RectSpan extends Component {
  ref = createRef()

  componentDidMount() { 
    Layout.positionRelativeAt(this.props.rect, this.ref.current, this.props.zoomFactor) 
  }

  componentDidUpdate() { 
    Layout.positionRelativeAt(this.props.rect, this.ref.current, this.props.zoomFactor) 
  }

  render(props) {
    return <span onclick={props.setFocus} data-annotation ref={this.ref} />
  }
}
