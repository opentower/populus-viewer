import { h, createRef, Component } from 'preact';
import * as Layout from "./layout.js"
import * as Matrix from "matrix-js-sdk"
import { eventVersion, spaceChild } from "./constants.js"
import UserColor from "./userColors.js"
import Client from './client.js'
import './styles/annotation-layer.css'

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

  filterAnnotations (content) {
    return (
      !!content[eventVersion] && // filter out old eventVersions
      content[eventVersion].pageNumber === this.props.page &&
      content[eventVersion].activityStatus !== "closed"
    )
  }

  getAnnotations() {
    const theRoom = Client.client.getRoom(this.props.roomId)
    const roomId = this.props.focus ? this.props.focus.roomId : null
    let annotations = []
    if (theRoom) {
      annotations = this.props.filteredAnnotationContents
        .filter(content => this.filterAnnotations(content))
        .map(content => <Annotation zoomFactor={this.props.zoomFactor}
          key={content[eventVersion].roomId}
          focused={roomId === content[eventVersion].roomId}
          typing={this.state.typing[content[eventVersion].roomId]}
          setFocus={this.props.setFocus}
          pdfWidthAdjusted={this.props.pdfWidthAdjusted}
          rightSide={content.timestamp % 2 === 1}
          content={content} />)
    }
    return annotations
  }

  render(props) {
    return (
      <div ref={props.annotationLayerWrapper} id="annotation-layer">
        {this.getAnnotations()}
      </div>
    )
  }
}

class Annotation extends Component {
  setFocus = _ => { this.props.setFocus(this.props.content[eventVersion]) }

  eventContent = this.props.content[eventVersion]

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
      data-annotation ref={this.ref}
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
