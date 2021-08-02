import { h, Component } from 'preact';
import './styles/annotationListing.css'
import * as Matrix from "matrix-js-sdk"
import { eventVersion, spaceChild } from "./constants.js"
import Client from './client.js'
import MemberPill from './memberPill.js'
import UserColor from './userColors.js'
import SearchBar from './search.js'
import { calculateUnread } from './utils/unread.js'
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

  focusInArray (array) {
    let reachedFocus = !this.props.focus
    for (const annot of array) {
      const theId = annot[eventVersion].roomId
      if (reachedFocus) {
        const unread = calculateUnread(theId)
        if (unread > 0 || unread === "All") {
          this.props.focusByRoomId(theId)
          break
        }
      } else {
        reachedFocus = this.props.focus.roomId === theId
      }
    }
  }

  nextUnread = _ => {
    this.focusInArray(this.props.filteredAnnotationContents)
  }

  prevUnread = _ => {
    const clone = [... this.props.filteredAnnotationContents]
    this.focusInArray(clone.reverse())
  }

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
      if (ts1 < ts2) return 1 * this.state.sortOrder
      else if (ts2 < ts1) return -1 * this.state.sortOrder
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
    return <div id="annotation-panel" class={props.class} >
              <div id="annotation-entries-wrapper">
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
                <button onclick={this.prevUnread} class="styled-button">Prev Unread</button>
                <button onclick={this.nextUnread} class="styled-button">Next Unread</button>
                <SearchBar
                  searchFilter={props.annotationFilter}
                  setSearch={props.setAnnotationFilter}
                  setFocus={this.setFocus} />
              </div>
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
    Client.client.on("Room.accountData", this.handleTimeline)
  }

  componentWillUnmount () {
    Client.client.off("Room.timeline", this.handleTimeline)
    Client.client.on("Room.accountData", this.handleTimeline)
  }

  handleClick = () => {
    this.props.focusByRoomId(this.props.annotationContent.roomId)
    this.props.pushHistory({
      pageFocused: this.props.annotationContent.pageNumber,
      pdfFocused: this.props.parentRoom.getCanonicalAlias()
    })
  }

  handleTimeline (_event, room) {
    if (this.props.annotationContent.roomId === room.roomId) {
      this.setState({unreadCount: calculateUnread(this.props.annotationContent.roomId)})
    }
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
      <div class="annotation-listing-text">{props.annotationContent.selectedText}</div>
      <div class="annotation-listing-page">page: {props.annotationContent.pageNumber}</div>
      <div class="annotation-listing-page">unread: {state.unreadCount}</div>
      <div class="annotation-listing-creator">creator: <MemberPill member={this.creator} /></div>
    </div>
  }
}
