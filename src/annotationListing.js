import { h, Component, createRef, Fragment } from 'preact';
import './styles/annotationListing.css'
import * as Matrix from "matrix-js-sdk"
import { renderLatexInElement } from './latex.js'
import { eventVersion, spaceChild } from "./constants.js"
import Client from './client.js'
import MemberPill from './memberPill.js'
import UserColor from './userColors.js'
import SearchBar from './search.js'
import { DisplayContent } from './message.js'
import UserInfoHeader from './userInfoHeader.js'
import * as Icons from './icons.js'

export default class AnnotationListing extends Component {
  constructor(props) {
    super(props)
    this.state = {
      typing: {},
      sort: "Page",
      sortOrder: 1,
      searchFocus: false
    }
    this.handleTypingNotification = this.handleTypingNotification.bind(this)
  }

  componentDidMount () {
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

  setFocus = searchFocus => this.setState({searchFocus})

  getSortFunc() {
    switch (this.state.sort) {
      case 'Page': return this.byPage
      case 'Activity': return this.byActivity
      case 'Creation': return this.byCreation
    }
  }

  byCreation = (a, b) => {
    if (a.timestamp > b.timestamp) return 1 * this.state.sortOrder
    if (a.timestamp < b.timestamp) return -1 * this.state.sortOrder
    return 0
  }

  byPage = (a, b) => {
    if (a[eventVersion].pageNumber > b[eventVersion].pageNumber) return 1 * this.state.sortOrder
    if (a[eventVersion].pageNumber < b[eventVersion].pageNumber) return -1 * this.state.sortOrder
    return 0
  }

  byActivity = (a, b) => {
    const room1 = Client.client.getRoom(a[eventVersion].roomId)
    const room2 = Client.client.getRoom(b[eventVersion].roomId)
    // XXX might not be a member of both rooms, hence unable to get timestamps
    if (room1 && room2) {
      const ts1 = room1.getLastActiveTimestamp()
      const ts2 = room2.getLastActiveTimestamp()
      if (ts1 > ts2) return 1 * this.state.sortOrder
      else if (ts1 < ts2) return -1 * this.state.sortOrder
      return 0
    }
    if (room1) return -1 * this.state.sortOrder
    if (room2) return 1 * this.state.sortOrder
    return 0
    // should warn that unjoined rooms are last
  }

  sortByActivity = _ => {
    const initialSort = this.state.sort
    if (initialSort === "Activity") this.setState(oldState => { return { sortOrder: oldState.sortOrder * -1 } })
    else this.setState({ sort: "Activity" })
  }

  sortByPage = _ => {
    const initialSort = this.state.sort
    if (initialSort === "Page") this.setState(oldState => { return { sortOrder: oldState.sortOrder * -1 } })
    else this.setState({ sort: "Page" })
  }

  sortByCreation = _ => {
    const initialSort = this.state.sort
    if (initialSort === "Creation") this.setState(oldState => { return { sortOrder: oldState.sortOrder * -1 } })
    else this.setState({ sort: "Creation" })
  }

  flipSort = _ => this.setState(oldState => { return { sortOrder: oldState.sortOrder * -1 } })

  render (props, state) {
    return <div id="annotation-panel" class={props.class}>
              <div id="annotation-entries-wrapper" onscroll={props.handleWidgetScroll}>
                <div id="annotation-controls">
                  <span class="small-icon"
                    style="cursor: pointer"
                    onClick={this.flipSort}>
                    {state.sortOrder === 1
                      ? Icons.sortDesc
                      : Icons.sortAsc
                    }
                  </span>
                  <button data-current-button={state.sort === "Page"}
                          onClick={this.sortByPage}
                          class="styled-button">Page</button>
                  <button data-current-button={state.sort === "Activity"}
                          onClick={this.sortByActivity}
                          class="styled-button">Activity</button>
                  <button data-current-button={state.sort === "Creation"}
                          onClick={this.sortByCreation}
                          class="styled-button">Creation</button>
                </div>
                  {props.annotationContents.length === 0
                    ? <div class="empty-marker"><b>No annotations yet available</b></div>
                    : props.filteredAnnotationContents.length === 0
                      ? <div class="empty-marker"><b>No annotations matching search</b></div>
                      : props.filteredAnnotationContents.sort(this.getSortFunc()).map(content =>
                        <AnnotationListingEntry
                            key={content[eventVersion].roomId}
                            unreadCount={props.unreadCounts[content[eventVersion].roomId]}
                            typing={state.typing[content[eventVersion].roomId]}
                            annotationContent={content[eventVersion]}
                            focusByRoomId={props.focusByRoomId}
                            focus={props.focus}
                            pushHistory={props.pushHistory}
                            parentRoom={props.room}
                        />)
                  }
              </div>
              <div id="annotation-panel-button-wrapper" data-mode={state.searchFocus ? "search" : "navigation"}>
                <button onclick={this.props.focusPrev} class="styled-button">Previous</button>
                <button onclick={this.props.focusNext} class="styled-button">Next</button>
                <SearchBar
                  search={props.annotationFilter}
                  setSearch={props.setAnnotationFilter}
                  setFocus={this.setFocus} />
              </div>
            </div>
  }
}

class AnnotationListingEntry extends Component {
  constructor(props) {
    super(props)
    this.state = {
      topic: props.annotationContent.selectedText
    }
  }

  componentDidMount () {
    renderLatexInElement(this.comment.current)
    // links should be processed for internal linking
    this.setTopic()
  }

  comment = createRef()

  async setTopic() {
    this.room = await Client.client.getRoomWithState(this.props.annotationContent.roomId)
    this.setState({
      topic: this.room.getLiveTimeline()
        .getState(Matrix.EventTimeline.FORWARDS)
        .getStateEvents("m.room.topic", "")
        ?.getContent().topic || this.props.annotationContent.selectedText
    })
  }

  handleClick = () => {
    this.props.focusByRoomId(this.props.annotationContent.roomId)
    this.props.pushHistory({
      pageFocused: this.props.annotationContent.pageNumber,
      pdfFocused: this.props.parentRoom.getCanonicalAlias()
    })
  }

  creator = this.props.parentRoom.getMember(this.props.annotationContent.creator)

  userColor = new UserColor(this.creator.userId)

  render(props, state) {
    const typing = typeof (props.typing) === "object" && Object.keys(props.typing).length > 0 ? true : null
    const focused = props.focus ? props.focus.roomId === this.props.annotationContent.roomId : false
    return <div style={this.userColor.styleVariables}
      data-annotation-entry-typing={typing}
      data-annotation-entry-focused={focused}
      onclick={this.handleClick}
      class="annotation-listing-entry">
      <div class="annotation-listing-topic">{state.topic}</div>
      <AnnotationListingComment
        creator={this.creator}
        unread={props.unreadCount}
        commentRef={this.comment}
        annotationContent={props.annotationContent}
      />
    </div>
  }
}

function AnnotationListingComment(props) {
  const content = props.annotationContent.rootContent
  if (content) {
    let body
    switch (content.msgtype) {
      case "m.text" : body = DisplayContent({content}); break
      case "m.notice" : body = <div class="annotation-listing-fallback"><p>Sent a notice</p></div>; break
      case "m.image" : body = <div class="annotation-listing-fallback"><p>Sent a file</p></div>; break
      case "m.video" : body = <div class="annotation-listing-fallback"><p>Sent a video</p></div>; break
      case "m.audio" : body = <div class="annotation-listing-fallback"><p>Sent an audio recording</p></div>; break
      default : 
        body = <div class="annotation-listing-fallback"><p>Sent a message</p></div>
        console.log(content)
    }
    return <Fragment>
      <div
        ref={props.commentRef}
        class={props.unread
          ? "annotation-listing-comment-unread"
          : "annotation-listing-comment"}
      > {body} </div>
      <div class="annotation-listing-creator"><MemberPill member={props.creator} /></div>
    </Fragment>
  } else if (props.annotationContent.activityStatus === "pending") {
    return <div class="annotation-listing-pending">awaiting your comment... </div>
  }
}
