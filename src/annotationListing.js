import { h, Component } from 'preact';
import './styles/annotationListing.css'
import * as Matrix from "matrix-js-sdk"
import { eventVersion, spaceChild } from "./constants.js"
import Client from './client.js'
import MemberPill from './memberPill.js'
import UserColor from './userColors.js'
import { calculateUnread } from './utils/unread.js'

export default class AnnotationListing extends Component {
  constructor(props) {
    super(props)
    this.state = {
      annotationContents: [],
      typing: {}
    }
    this.handleStateUpdate = this.handleStateUpdate.bind(this)
    this.handleTypingNotification = this.handleTypingNotification.bind(this)
  }

  componentDidMount () {
    this.handleStateUpdate()
    Client.client.on("RoomState.events", this.handleStateUpdate)
    Client.client.on("RoomMember.typing", this.handleTypingNotification)
  }

  componentDidUnmount () {
    Client.client.off("RoomState.events", this.handleStateUpdate)
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

    handleStateUpdate = _ => {
      if (this.props.room) {
        const annotationContents = this.props.room.getLiveTimeline()
          .getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild)
          .map(ev => ev.getContent())
          .filter(content => content[eventVersion] && content[eventVersion].activityStatus === "open")
        this.setState({ annotationContents})
      } else setTimeout(this.handleStateUpdate, 500) // keep polling until the room is available
    }

    render (props, state) {
      const annotationEntries = state.annotationContents.map(content => <AnnotationListingEntry
                                                                key={content[eventVersion].roomId}
                                                                typing={state.typing[content[eventVersion].roomId]}
                                                                annotationContent={content[eventVersion]}
                                                                focusByRoomId={props.focusByRoomId}
                                                                pushHistory={props.pushHistory}
                                                                parentRoom={props.room}
                                                                />)
      return <div id="annotation-panel" class={props.class} >
                    {state.annotationContents.length > 0
                      ? annotationEntries
                      : <div class="empty-marker"><b>No annotations yet available </b></div>
                    }
              </div>
    }
}

// XXX: could DRY by making a superclass from this and AnnotationRoomEntry
class AnnotationListingEntry extends Component {
  constructor(props) {
    super(props)
    this.state = {unreadCount: calculateUnread(this.props.annotationContent.roomId)}
    this.handleTimeline = this.handleTimeline.bind(this)
  }

  componentDidMount () {
    Client.client.on("Room.timeline", this.handleTimeline)
  }

  componentWillUnmount () {
    Client.client.off("Room.timeline", this.handleTimeline)
  }

  handleClick = () => {
    this.props.focusByRoomId(this.props.annotationContent.roomId)
    this.props.pushHistory({
      pageFocused: this.props.annotationContent.pageNumber,
      pdfFocused: this.props.parentRoom.name
    })
  }

  handleTimeline (event) {
    if (this.props.annotationContent.roomId === event.getRoomId()) {
      this.setState({unreadCount: calculateUnread(this.props.annotationContent.roomId)})
    }
  }

  creator = this.props.parentRoom.getMember(this.props.annotationContent.creator)

  userColor = new UserColor(this.creator.userId)

  render(props, state) {
    const typing = typeof (props.typing) === "object" && Object.keys(props.typing).length > 0 ? true : null
    return <div style={this.userColor.styleVariables} data-annotation-entry-typing={typing} onclick={this.handleClick} class="annotation-listing-entry">
              <div class="annotation-listing-text">{props.annotationContent.selectedText}</div>
              <div class="annotation-listing-page">page: {props.annotationContent.pageNumber}</div>
              <div class="annotation-listing-page">unread: {state.unreadCount}</div>
              <div class="annotation-listing-creator">creator: <MemberPill member={this.creator} /></div>
          </div>
  }
}
