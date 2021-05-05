import { h, createRef, Component } from 'preact';
import * as Layout from "./layout.js"
import * as Matrix from "matrix-js-sdk"
import { eventVersion, spaceChild } from "./constants.js"
import UserColor from "./userColors.js"
import './styles/annotation-layer.css'
import './styles/content-container.css'
import './styles/text-layer.css'

export default class AnnotationLayer extends Component {
  constructor(props) {
    super(props)
    this.state = {typing: {}}
    this.handleStateUpdate = this.handleStateUpdate.bind(this)
    this.handleTypingNotification = this.handleTypingNotification.bind(this)
  }

  componentDidMount() {
    this.props.client.on("RoomState.events", this.handleStateUpdate)
    this.props.client.on("RoomMember.typing", this.handleTypingNotification)
  }

  componentDidUnmount () {
    this.props.client.off("RoomState.events", this.handleStateUpdate)
    this.props.client.off("RoomMember.typing", this.handleTypingNotification)
  }

  handleTypingNotification = (event, member) => {
    const theRoomState = this.props.client.getRoom(this.props.roomId).getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theChildRelation = theRoomState.getStateEvents(spaceChild, member.roomId)
    // We use nested state here because we want to pass this part of the state to a child
    if (theChildRelation) {
      this.setState(prevState => {
        const myId = this.props.client.getUserId()
        const typingOtherThanMe = event.getContent().user_ids.filter(x => x !== myId)
        return {typing: { ...prevState.typing, [member.roomId]: typingOtherThanMe}}
      })
    }
  }

  handleStateUpdate = event => {
    if (event.getRoomId() === this.props.roomId && event.getType() === spaceChild) {
      this.forceUpdate()
    }
  }

  filterAnnotations (event) {
    return (
      !!event.getContent()[eventVersion] && // filter out old eventVersions
      event.getContent()[eventVersion].pageNumber === this.props.page &&
      event.getContent()[eventVersion].activityStatus !== "closed"
    )
  }

  render(props, state) {
    // just to get started
    const theRoom = props.client.getRoom(props.roomId)
    const roomId = props.focus ? props.focus.roomId : null
    let annotations = []
    if (theRoom) {
      const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
      annotations = theRoomState.getStateEvents(spaceChild)
        .filter(event => this.filterAnnotations(event))
        .map(event => <Annotation zoomFactor={props.zoomFactor}
          key={event.getContent()[eventVersion].roomId}
          focused={roomId === event.getContent()[eventVersion].roomId}
          typing={state.typing[event.getContent()[eventVersion].roomId]}
          setFocus={props.setFocus}
          event={event} />)
    }
    return (
      <div ref={props.annotationLayerWrapper} id="annotation-layer">
        {annotations}
      </div>
    )
  }
}

class Annotation extends Component {
  setFocus = _ => { this.props.setFocus(this.props.event.getContent()[eventVersion]) }

  inlineAnnotations = createRef()

  eventContent = this.props.event.getContent()[eventVersion]

  roomId = this.eventContent.roomId

  boundingRect = JSON.parse(this.eventContent.boundingClientRect)

  spans = JSON.parse(this.eventContent.clientRects).map(
    rect => <RectSpan key={rect} zoomFactor={this.props.zoomFactor} setFocus={this.setFocus} rect={rect} />
  )

  userColor = new UserColor(this.eventContent.creator)

  render(props) {
    const typing = typeof (props.typing) === "object" && Object.keys(props.typing).length > 0 ? true : null
    return <div style={this.userColor.styleVariables} data-annotation-typing={typing} data-focused={props.focused} id={this.roomId}>
      <BarTab rect={this.boundingRect} zoomFactor={props.zoomFactor} setFocus={this.setFocus} />
      <InlineAnnotations rect={this.boundingRect}>
        {this.spans}
      </InlineAnnotations>
    </div>
  }
}

class InlineAnnotations extends Component {
  ref = createRef()

  componentDidMount() { Layout.positionRelativeAt(this.props.rect, this.ref.current, this.props.zoomFactor) }

  componentDidUpdate() { Layout.positionRelativeAt(this.props.rect, this.ref.current, this.props.zoomFactor) }

  render(props) {
    return <div ref={this.ref} class="inline-annotations">{props.children}</div>
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
    Layout.positionRelativeAt(this.getTabRect(), this.ref.current, this.props.zoomFactor)
    this.scootch()
  }

  componentDidUpdate() {
    Layout.positionRelativeAt(this.getTabRect(), this.ref.current, this.props.zoomFactor)
    this.scootch()
  }

  ref = createRef()

  getTabRect = _ => new DOMRect(5 + this.state.overlapOffset, this.props.rect.y, 5, this.props.rect.height)

  scootch = _ => {
    const rect = this.ref.current.getBoundingClientRect()
    const overlaps = document.elementsFromPoint(rect.x + 1, rect.y + 1)
      .filter(elt => {
        const eltRect = elt.getBoundingClientRect()
        const isAnnot = elt.className === "annotation-bartab"
        const isPrior = elt.compareDocumentPosition(this.ref.current) === 4
        return (isAnnot && ((eltRect.y < rect.y) || (isPrior && eltRect.y === rect.y)))
      })
    if (overlaps.length > 0) this.setState({overlapOffset: this.state.overlapOffset + 10})
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

  componentDidMount() { Layout.positionRelativeAt(this.props.rect, this.ref.current, this.props.zoomFactor) }

  componentDidUpdate() { Layout.positionRelativeAt(this.props.rect, this.ref.current, this.props.zoomFactor) }

  render(props) {
    return <span onclick={props.setFocus} data-annotation ref={this.ref} />
  }
}
