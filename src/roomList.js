import { h, Fragment, Component } from 'preact';
import { spaceChild, lastViewed } from "./constants.js"
import Resource from "./utils/resource.js"
import Location from "./utils/location.js"
import * as Matrix from "matrix-js-sdk"
import MemberPill from './memberPill.js'
import Client from './client.js'
import Modal from './modal.js'
import Invite from './invite.js'
import { TagEditor, TagList } from './tagEditor.js'
import RoomSettings from './roomSettings.js'
import { RoomColor } from './utils/colors.js'
import * as Icons from './icons.js'
import History from './history.js'
import './styles/roomList.css'

export default class RoomList extends Component {
  constructor(props) {
    super(props)
    this.state = {
      rooms: Client.client.getVisibleRooms().filter(Resource.hasResource),
      sort: "Activity",
      memberLimit: document.body.offsetWidth > 400 ? 15 : 5,
      sortOrder: 1
    }
  }

  roomListener = _ => {
    clearTimeout(this.roomDebounceTimeout)
    this.roomDebounceTimeout = setTimeout(_ => {
      this.setState({
        rooms: Client.client.getVisibleRooms()
          .filter(Resource.hasResource)
          .filter(room => room.getMyMembership() === "join")
      })
    })
  }

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

  flipSort = _ => {
    this.setState(oldState => {
      return { sortOrder: oldState.sortOrder * -1 }
    })
  }

  getSortFunc() {
    switch (this.state.sort) {
      case 'Activity': return this.byActivity
      case 'Name': return this.byName
    }
  }

  searchRooms = _ => {
    // TODO: We're going to want to have different subcategories of rooms,
    // for actual pdfs, and for annotation discussions
    const searchNames = []
    const searchTags = []
    const searchMembers = []
    const searchFlags = []
    const searchParents = []
    const searchWords = []
    const regex = /[^\s"]+|"([^"]*)"/gi
    let match
    do {
      match = regex.exec(this.props.searchFilter)
      if (match != null) searchWords.push(match[1] ? match[1] : match[0])
    } while (match != null)
    for (const word of searchWords) {
      if (word.slice(0, 1) === '#') searchTags.push(word.slice(1))
      else if (word.slice(0, 1) === '@') searchMembers.push(word.slice(1))
      else if (word.slice(0, 1) === '*') searchParents.push(word.slice(1))
      else if (word.slice(0, 1) === '~') searchFlags.push(word.slice(1))
      else searchNames.push(word)
    }
    // XXX ↓ very naive implementation, watch for speed
    return this.state.rooms.filter(room => {
      let flagged = true
      if (searchFlags.includes("fav")) { flagged = flagged && !!room.tags["m.favourite"] }
      const tags = Object.keys(room.tags).filter(tag => tag.slice(0, 2) === 'u.')
      const state = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
      // TODO: could make the below smarter to search by displayname as well as userID.
      const roomMembers = state.getMembers().map(m => m.userId)
      const parents = state.getStateEvents("m.space.parent").map(e => Client.client.getRoom(e.getStateKey())?.name).filter(e => e)
      return searchNames.every(name => room.name.toLowerCase().includes(name.toLowerCase())) &&
        searchMembers.every(member => roomMembers.some(roomMember => roomMember.toLowerCase().includes(member.toLowerCase()))) &&
        searchTags.every(searchTag => tags.some(tag => tag.toLowerCase().includes(searchTag.toLowerCase()))) &&
        searchParents.every(searchParent => parents.some(parent => parent.toLowerCase().includes(searchParent.toLowerCase()))) &&
        flagged
    })
  }

  sortRooms = rooms => {
    return rooms.sort(this.getSortFunc())
      .map(room => {
        const resource = new Resource(room)
        let result = null
        if (room.getMyMembership() === "join" && resource.url) {
          result = <RoomEntry
            memberLimit={this.props.narrow ? 5 : 15}
            room={room}
            key={room.roomId} />
        }
        return result
      }).filter(room => room !== null)
  }

  render(_, state) {
    return <div id="room-list">
      <div id="select-sort">
        <button class="small-icon"
          style="cursor: pointer"
          onClick={this.flipSort}>
          {state.sortOrder === 1
            ? Icons.sortDesc
            : Icons.sortAsc
          }
        </button>
        <button data-current-button={state.sort === "Activity"}
                onClick={this.sortByActivity}
                class="styled-button">Activity</button>
        <button data-current-button={state.sort === "Name"}
                onClick={this.sortByName}
                class="styled-button">Name</button>
      </div>
      {/* TODO: We're probably going to need to debounce this rather than searching with each render, for longer lists of rooms */}
      <div>{this.sortRooms(this.searchRooms())}</div>
    </div>
  }
}

class RoomEntry extends Component {
  constructor(props) {
    super(props)
    this.state = { buttonsVisible: false }
  }

  getLastViewedPage = _ => this.props.room.getAccountData(lastViewed)
    ? this.props.room.getAccountData(lastViewed).getContent().page
    : 1

  roomColor = new RoomColor(this.props.room.roomId)

  toggleButtons = _ => this.setState(oldState => { return { buttonsVisible: !oldState.buttonsVisible } })

  openInvite = _ => Modal.set(<Invite roomId={this.props.room.roomId} />)

  openSettings = _ => Modal.set(<RoomSettings room={this.props.room} />)

  handleEditTags = _ => Modal.set(<TagEditor room={this.props.room} />)

  toggleFavorite = _ => {
    if (this.props.room.tags["m.favourite"]) Client.client.deleteRoomTag(this.props.room.roomId, "m.favourite")
    else Client.client.setRoomTag(this.props.room.roomId, "m.favourite", {order: 0.5})
  }

  handleClose = _ => Client.client.leave(this.props.room.roomId)

  render (props, state) {
    const userMember = props.room.getMember(Client.client.getUserId())
    const isAdmin = userMember.powerLevel >= 100
    const canInvite = props.room.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
      .hasSufficientPowerLevelFor("invite", userMember.powerLevel)
    return <div style={this.roomColor.styleVariables} class="room-listing-entry" id={props.room.roomId}>
      <AvatarPanel getLastViewedPage={this.getLastViewedPage} room={props.room} />
      <div data-room-entry-buttons-visible={state.buttonsVisible} class="room-listing-body">
        <div class="room-listing-heading">
          {props.room.tags["m.favourite"] ? <span class="fav-star"> {Icons.star} </span> : null}
          <a href={`${window.location.origin}${window.location.pathname}#/${encodeURIComponent(props.room.getCanonicalAlias().slice(1))}/${this.getLastViewedPage()}`}>{props.room.name}</a>
        </div>
        <div class="room-listing-data">
          <RoomTagListing room={props.room} />
          <MemberListing room= {props.room} memberLimit={props.memberLimit} />
        </div>
        <div class="room-listing-entry-buttons">
          { state.buttonsVisible ? null : <button title="Toggle buttons" onClick={this.toggleButtons}>{Icons.moreVertical}</button> }
          { state.buttonsVisible ? <button title="Toggle buttons" onClick={this.toggleButtons}>{Icons.close}</button> : null }
          { state.buttonsVisible ? <button title="Toggle favorite" onClick={this.toggleFavorite}>{Icons.star}</button> : null }
          { state.buttonsVisible ? <button title="Leave conversation" onClick={this.handleClose}>{Icons.exit}</button> : null }
          { state.buttonsVisible ? <button title="Edit room tags" onClick={this.handleEditTags}>{Icons.tag}</button> : null }
          { state.buttonsVisible && canInvite ? <button title="Invite a friend" onClick={this.openInvite}>{Icons.userPlus}</button> : null }
          { state.buttonsVisible && isAdmin ? <button title="Configure room settings" onClick={this.openSettings}>{Icons.settings}</button> : null }
        </div>
      </div>
    </div>
  }
}

class AvatarPanel extends Component {
  constructor(props) {
    super(props)
    const avatarEvent = props.room.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
      .getStateEvents("m.room.avatar", "")
    this.state = {
      avatarEvent,
      loaded: false,
      avatarUrl: avatarEvent?.getContent()?.url
        ? Client.client.getHttpUriForMxcFromHS(avatarEvent.getContent().url, 800, 600, "scale")
        : null
    }
  }

  componentDidMount () {
    Client.client.on("RoomState.events", this.handleStateUpdate)
  }

  componentWillUnmount () {
    Client.client.off("RoomState.events", this.handleStateUpdate)
  }

  handleStateUpdate = e => {
    if (e.getRoomId() === this.props.room.roomId && e.getType() === "m.room.avatar") {
      this.setState({
        avatarEvent: e,
        avatarUrl: e.getContent().url
          ? Client.client.getHttpUriForMxcFromHS(avatarEvent.getContent().url, 800, 600, "scale")
          : null
      })
    }
  }

  handleLoad = _ => this.setState({ loaded: true })

  render(props, state) {
    const avatarInfo = state.avatarEvent?.getContent()?.info
    // using max/min here rather than setting the height directly so that the height doesn't affect the object-fit: cover of the image,
    // But so that the div is still the right size prior to image-load
    const avatarListingStyle = avatarInfo
      ? { "min-height": Math.min(300, avatarInfo.h), "max-height": Math.min(300, avatarInfo.h) }
      : null
    return <div style={avatarListingStyle} data-has-avatar={!!state.avatarUrl} class="room-listing-avatar">
      {state.avatarUrl
        ? <img src={state.avatarUrl}
            onLoad={this.handleLoad}
            data-avatar-loaded={state.loaded}
            loading="lazy"
            alt="room avatar" />
        : null
      }
      <AnnotationData getLastViewedPage={props.getLastViewedPage} room={props.room} />
    </div>
  }
}

function RoomTagListing(props) {
  const tagCount = Object.keys(props.room.tags).filter(tag => tag.slice(0, 2) === 'u.').length
  return tagCount > 0
    ? <div class="room-listing-data-row">
      <span class="room-data-icon">{Icons.tag}</span>
      <TagList room={props.room} />
    </div>
    : null
}

class MemberListing extends Component {
  constructor(props) {
    super(props)
    this.state = { open: false }
  }

  toggleMemberList = _ => this.setState(oldState => { return { open: !oldState.open} })

  render(props, state) {
    const members = props.room.getMembersWithMembership("join")
    const invites = props.room.getMembersWithMembership("invite")
    const memberPills = state.open
      ? members.map(member => <MemberPill key={member.userId} member={member} />)
      : members.slice(0, props.memberLimit).map(member => <MemberPill key={member.userId} member={member} />)
    const invitePills = invites.map(invite => <span key={invite.userId} class="invite-pill"><MemberPill member={invite} /></span>)
    return <div class="room-listing-data-row">
      <span class="room-data-icon">{Icons.userMany}</span><Fragment>{memberPills}</Fragment><Fragment>{invitePills}</Fragment>
      { members.length <= props.memberLimit
        ? null
        : state.open
          ? <button onclick={this.toggleMemberList} class="room-toggle-members">{Icons.close}</button>
          : <button onclick={this.toggleMemberList} class="room-toggle-members">and {members.length - props.memberLimit} more.</button>
      }
    </div>
  }
}

class AnnotationData extends Component {
  constructor(props) {
    super(props)
    this.state = {
      annotations: []
    }
    this.handleTimeline = this.handleTimeline.bind(this)
    this.handleStateUpdate = this.handleStateUpdate.bind(this)
    this.handleInitialSync = this.handleInitialSync.bind(this)
  }

  componentDidMount() {
    Client.client.on("RoomState.events", this.handleStateUpdate)
    Client.client.on("Room.accountData", this.handleTimeline)
    Client.client.on("Room.timeline", this.handleTimeline)
    Client.client.on("sync.initial", this.handleInitialSync)
    // We let the initialSyncHandler manage this if we're not syncing yet.
    if (Client.client.getSyncState() !== "PREPARED") this.updateAnnotations()
  }

  componentWillUnmount() {
    Client.client.off("RoomState.events", this.handleStateUpdate)
    Client.client.off("Room.accountData", this.handleTimeline)
    Client.client.off("sync.initial", this.handleInitialSync)
    Client.client.off("Room.timeline", this.handleTimeline)
  }

  handleInitialSync() {
    // Need this extra step, since I don't think account data update events are
    // fired by the initial sync
    this.updateAnnotations()
  }

  updateAnnotations = _ => {
    const annotations = this.props.room.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild)
      .map(ev => new Location(ev))
      .filter(loc => loc.isValid() && loc.getStatus() === "open")
    this.setState({annotations})
  }

  handleStateUpdate = e => {
    if (e.getRoomId() === this.props.room.roomId && e.getType() === spaceChild) {
      this.updateAnnotations()
    }
  }

  handleTimeline (_event, room) {
    const childIds = this.state.annotations.map(loc => loc.getChild())
    if (room?.roomId in childIds) this.updateAnnotations()
  }

  handleLoadNew = _ => {
    History.push(
      `/${encodeURIComponent(this.props.room.getCanonicalAlias().slice(1))}/${this.props.getLastViewedPage() || 1}/`,
      {searchString: "~unread"}
    )
  }

  getUnreadCount = _ => this.state.annotations.filter(loc => loc.getUnread()).length

  render() {
    const unread = this.getUnreadCount()
    return <div class="room-annotation-data">
      {unread < 1
        ? null
        : <span title="Unread conversations" onClick={this.handleLoadNew}>
          <button class="small-icon">{Icons.annotation}</button>
          <span class="small-icon-badge">{unread}</span>
        </span>
      }
    </div>
  }
}
