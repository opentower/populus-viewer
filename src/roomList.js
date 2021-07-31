import { h, Fragment, Component, createRef } from 'preact';
import { pdfStateType, eventVersion, spaceChild, lastViewed } from "./constants.js"
import * as Matrix from "matrix-js-sdk"
import UserColor from './userColors.js'
import MemberPill from './memberPill.js'
import QueryParameters from './queryParams.js'
import Client from './client.js'
import Invite from './invite.js'
import RoomSettings from './roomSettings.js'
import * as Icons from './icons.js'
import { calculateUnread } from './utils/unread.js'
import './styles/roomList.css'

export default class RoomList extends Component {
  constructor(props) {
    super(props)
    this.state = {
      rooms: Client.client.getVisibleRooms(),
      sort: "Activity",
      sortOrder: 1
    }
    // need to do this to bind "this" as refering to the RoomList component in the listener
    this.roomListener = this.roomListener.bind(this)
  }

  roomListener () { this.setState({ rooms: Client.client.getVisibleRooms() }) }

  componentDidMount () {
    Client.client.on("Room", this.roomListener)
    Client.client.on("Room.name", this.roomListener)
    Client.client.on("RoomState.events", this.roomListener)
    Client.client.on("Room.accountData", this.roomListener)
    // State events might cause excessive rerendering, but we can optimize for that later
  }

  componentWillUnmount () {
    Client.client.off("Room", this.roomListener)
    Client.client.off("Room.name", this.roomListener)
    Client.client.off("RoomState.events", this.roomListener)
    Client.client.off("Room.accountData", this.roomListener)
  }

  byActivity = (a, b) => {
    const ts1 = a.getLastActiveTimestamp()
    const ts2 = b.getLastActiveTimestamp()
    if (ts1 < ts2) return 1 * this.state.sortOrder
    else if (ts2 < ts1) return -1 * this.state.sortOrder
    return 0
  }

  byName = (a, b) => {
    const ts1 = a.name
    const ts2 = b.name
    if (ts1 > ts2) return 1 * this.state.sortOrder
    else if (ts1 < ts2) return -1 * this.state.sortOrder
    return 0
  }

  byFavorite() { return 0 }

  sortByActivity = _ => {
    this.setState(oldState =>
      oldState.sort === "Activity"
        ? { sortOrder: oldState.sortOrder * -1 }
        : { sort: "Activity" }
    )
  }

  sortByName = _ => {
    this.setState(oldState =>
      oldState.sort === "Name"
        ? { sortOrder: oldState.sortOrder * -1 }
        : { sort: "Name" }
    )
  }

  flipSort = _ => this.setState(oldState => {
    return { sortOrder: oldState.sortOrder * -1 }
  })

  sortByFavorite = _ => this.setState({ sort: "Favorite" })

  getSortFunc() {
    switch (this.state.sort) {
      case 'Activity': return this.byActivity
      case 'Name': return this.byName
      case 'Favorite': return this.byFavorite
    }
  }

  searchRooms = _ => {
    // TODO: We're going to want to have different subcategories of rooms,
    // for actual pdfs, and for annotation discussions
    const searchNames = []
    const searchTags = []
    const searchMembers = []
    const searchWords = this.props.searchFilter.split(" ")
    for (const word of searchWords) {
      if (word.slice(0, 1) === '#') searchTags.push(word.slice(1))
      if (word.slice(0, 1) === '@') searchMembers.push(word.slice(1))
      else searchNames.push(word)
    }
    return this.state.rooms.filter(room => {
      const favorite = this.state.sort !== "Favorite" || room.tags["m.favourite"]
      const tags = Object.keys(room.tags).filter(tag => tag.slice(0, 2) === 'u.')
      // TODO: could make the below smarter to search by displayname as well as userID.
      const roomMembers = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getMembers().map(m => m.userId)
      return searchNames.every(name => room.name.toLowerCase().includes(name)) &&
        searchMembers.every(member => roomMembers.some(roomMember => roomMember.toLowerCase().includes(member))) &&
        searchTags.every(searchTag => tags.some(tag => tag.toLowerCase().includes(searchTag))) &&
        favorite
    }).sort(this.getSortFunc())
      .map(room => {
        const pdfEvent = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents(pdfStateType, "")
        const annotations = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild)
        let result = null
        switch (room.getMyMembership()) {
          case "join" : {
            if (pdfEvent) {
              result = <PDFRoomEntry annotations={annotations}
                pushHistory={this.props.pushHistory}
                populateModal={this.props.populateModal}
                room={room}
                pdfevent={pdfEvent} />
            }
            break
          }
          case "invite" : {
            result = <InviteEntry room={room}
              roomListener={this.roomListener}
            />
          }
        }
        return result
      })
  }

  render(_, state) {
    return (
      <Fragment>
        <div id="select-sort">
          <span class="small-icon"
            style="cursor: pointer"
            onClick={this.flipSort}>
            {state.sortOrder === 1
              ? Icons.sortDesc
              : Icons.sortAsc
            }
          </span>
          <button data-current-button={state.sort === "Activity"}
                  onClick={this.sortByActivity}
                  class="styled-button">Activity</button>
          <button data-current-button={state.sort === "Name"}
                  onClick={this.sortByName}
                  class="styled-button">Name</button>
          <button data-current-button={state.sort === "Favorite"}
                  onClick={this.sortByFavorite}
                  class="styled-button">Favorite</button>
        </div>
        {/* TODO: We're going to need to debounce this rather than searching with each render, for longer lists of rooms */}
        <div>{this.searchRooms()}</div>
      </Fragment>
    )
  }
}

class PDFRoomEntry extends Component {
  constructor(props) {
    super(props)
    this.state = {
      buttonsVisible: false,
      detailsOpen: false
    }
  }

  handleLoad = _ => {
    const lastViewedPage = this.props.room.getAccountData(lastViewed)
      ? this.props.room.getAccountData(lastViewed).getContent().page
      : 1
    this.props.pushHistory({
      pdfFocused: this.props.room.getCanonicalAlias(),
      pageFocused: lastViewedPage || 1
    })
  }

  toggleButtons = _ => this.setState({ buttonsVisible: !this.state.buttonsVisible })

  openInvite = _ => this.props.populateModal(
    <Invite populateModal={this.props.populateModal}
            roomId={this.props.room.roomId} />)

  openSettings = _ => this.props.populateModal(
    <RoomSettings populateModal={this.props.populateModal}
                  room={this.props.room} />)

  handleEditTags = _ => this.props.populateModal(
    <TagEditor room={this.props.room} />
  )

  toggleFavorite = _ => {
    if (this.props.room.tags["m.favourite"]) Client.client.deleteRoomTag(this.props.room.roomId, "m.favourite")
    else Client.client.setRoomTag(this.props.room.roomId, "m.favourite", {order: 0.5})
  }

  handleClose = _ => Client.client.leave(this.props.room.roomId)

  handleDetailsToggle = _ => this.setState({ detailsOpen: !this.state.detailsOpen })

  render (props, state) {
    const members = props.room.getMembersWithMembership("join")
    const invites = props.room.getMembersWithMembership("invite")
    const memberIds = members.map(member => member.userId)
    const memberPills = members.map(member => <MemberPill key={member.userId} member={member} />)
    const invitePills = invites.map(invite => <span key={invite.userId} class="invite-pill"><MemberPill member={invite} /></span>)
    const status = memberIds.includes(Client.client.getUserId())
      ? "joined"
      : "invited"
    const annotations = props.annotations.map(ev => ev.getContent())
      .filter(content => !!content[eventVersion]) // so that we can bump eventversion
      .filter(content => content[eventVersion].activityStatus === "open")
      .map(content => <AnnotationRoomEntry key={content[eventVersion].roomId}
                                           pushHistory={props.pushHistory}
                                           annotationContent={content[eventVersion]}
                                           parentRoom={props.room} />)
    return (
      <div data-room-entry-buttons-visible={state.buttonsVisible} data-room-status={status} class="room-listing-entry" id={props.room.roomId}>
        <div class="room-listing-heading">
          {props.room.tags["m.favourite"] ? <span class="fav-star"> {Icons.star} </span> : null}
          <a onClick={this.handleLoad}>{props.room.name}</a>
        </div>
        <div class="room-listing-data">
          <div class="room-listing-data-row">
            <span class="room-data-icon">{Icons.userMany}</span><Fragment>{memberPills}</Fragment><Fragment>{invitePills}</Fragment>
          </div>
          <TagList room={props.room} />
        </div>
        {annotations.length > 0
          ? <div><details>
            <summary open={state.detailsOpen} ontoggle={this.handleDetailsToggle}>
              {annotations.length} annotation{annotations.length > 1 ? "s" : null }
            </summary>
            <div class="annotation-rooms">
              {annotations}
            </div>
          </details></div>
          : null
        }
        <div class="room-listing-entry-buttons">
          { state.buttonsVisible ? null : <button title="Toggle buttons" onClick={this.toggleButtons}>{Icons.moreVertical}</button> }
          { state.buttonsVisible ? <button title="Toggle buttons" onClick={this.toggleButtons}>{Icons.close}</button> : null }
          { state.buttonsVisible ? <button title="Toggle favorite" onClick={this.toggleFavorite}>{Icons.star}</button> : null }
          { state.buttonsVisible ? <button title="Invite a friend" onClick={this.openInvite}>{Icons.userPlus}</button> : null }
          { state.buttonsVisible ? <button title="Configure room settings" onClick={this.openSettings}>{Icons.settings}</button> : null }
          { state.buttonsVisible ? <button title="Leave conversation" onClick={this.handleClose}>{Icons.exit}</button> : null }
          { state.buttonsVisible ? <button title="Edit room tags" onClick={this.handleEditTags}>{Icons.tag}</button> : null }
        </div>
      </div>
    )
  }
}

function TagList(props) {
  const roomTags = Object.keys(props.room.tags)
    .filter(tag => tag.slice(0, 2) === 'u.')
    .map(tag => <Tag key={`${props.room.roomId}"-tag-"${props.tag}`} room={props.room} tag={tag} />)
  return roomTags.length > 0
    ? <div class="room-listing-data-row">
      <span class="room-data-icon">{Icons.tag}</span><Fragment>{roomTags}</Fragment>
    </div>
    : null
}

class TagEditor extends Component {
  constructor(props) {
    super(props)
    this.state = {
      newTag: "",
      tags: Object.keys(props.room.tags)
    }
    this.accountListener = this.accountListener.bind(this)
  }

  componentDidMount () {
    Client.client.on("Room.accountData", this.accountListener)
  }

  componentWillUnmount () {
    Client.client.off("Room.accountData", this.accountListener)
  }

  accountListener () {
    this.setState({tags: Object.keys(this.props.room.tags)})
  }

  newTagInput = createRef()

  handleBlur = _ => this.setState({newTag: ""})

  handleKeyup = e => {
    if (e.key === "Enter") {
      Client.client.setRoomTag(this.props.room.roomId, `u.${this.newTagInput.current.value}`, {order: 0.5})
      this.setState({newTag: ""})
    } else this.setState({newTag: this.newTagInput.current.value})
  }

  handleClick = name => _ => {
    Client.client.deleteRoomTag(this.props.room.roomId, name)
  }

  render(props, state) {
    const roomTags = state.tags
      .filter(tag => tag.slice(0, 2) === 'u.')
      .map(tag => <Fragment key={`${props.room.roomId}"-tag-"${tag}`}>
        <span onclick={this.handleClick(tag)}
          class="room-tag-delete-icon">{Icons.trash}</span>
        <Tag room={props.room} tag={tag} />
      </Fragment>)
    return <div class="tag-editor">
        <Fragment>{roomTags}</Fragment>
        <input ref={this.newTagInput}
          class="styled-input tag-input"
          value={state.newTag}
          onkeyup={this.handleKeyup}
          onblur={this.handleBlur}
          placeholder="new tag" />
      </div>
  }
}

function Tag(props) {
  return <span class="room-tag">{props.tag.slice(2)}</span>
}

class InviteEntry extends Component {
  accept = _ => {
    Client.client.joinRoom(this.props.room.roomId)
    setTimeout(this.props.roomListener, 1000)
    // XXX the updates get grouped in such a way that the redraw misses the state
    // update that comes with the join. So we need to do a second update to the
    // room listing, here.
  }

  decline = _ => {
    Client.client.leave(this.props.room.roomId)
    setTimeout(this.props.roomListener, 1000)
  }

  render(props) {
    return <div class="invite-entry">
      <div class="invite-heading">
        You are invited to join the discussion {props.room.name}.
      </div>
      <div class="invite-buttons">
        <button class="styled-button" onclick={this.accept}>Accept</button>
        <button class="styled-button" onclick={this.decline}>Decline</button>
      </div>
    </div>
  }
}

class AnnotationRoomEntry extends Component {
  constructor(props) {
    super(props)
    this.state = {unreadCount: calculateUnread(this.props.annotationContent.roomId)}
    this.handleTimeline = this.handleTimeline.bind(this)
    this.creator = this.props.parentRoom.getMember(this.props.annotationContent.creator)
    this.userColor = new UserColor(this.creator.userId)
  }

  handleClick = () => {
    QueryParameters.set("focus", this.props.annotationContent.roomId)
    this.props.pushHistory({
      pageFocused: this.props.annotationContent.pageNumber,
      pdfFocused: this.props.parentRoom.getCanonicalAlias()
    })
  }

  componentDidMount () {
    Client.client.on("Room.timeline", this.handleTimeline)
  }

  componentWillUnmount () {
    Client.client.off("Room.timeline", this.handleTimeline)
  }

  handleTimeline (event) {
    if (this.props.annotationContent.roomId === event.getRoomId()) {
      this.setState({unreadCount: calculateUnread(this.props.annotationContent.roomId)})
    }
  }

  render (props, state) {
    return <div style={this.userColor.styleVariables} class="annotation-room-entry">
      <div class="annotation-room-entry-snip">…&nbsp;<a onClick={this.handleClick}>{props.annotationContent.selectedText}</a>&nbsp;…</div>
      <div class="annotation-room-entry-data">
        <div class="annotation-room-page">p: {props.annotationContent.pageNumber}</div>
        <div class="annotation-room-unread">{Icons.bell}&nbsp;{state.unreadCount}</div>
      </div>
    </div>
  }
}
