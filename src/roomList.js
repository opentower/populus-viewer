import { h, Fragment, Component, createRef } from 'preact';
import { pdfStateType, eventVersion, spaceChild, lastViewed } from "./constants.js"
import * as Matrix from "matrix-js-sdk"
import MemberPill from './memberPill.js'
import Client from './client.js'
import Invite from './invite.js'
import RoomSettings from './roomSettings.js'
import * as Icons from './icons.js'
import { calculateUnread } from './utils/unread.js'
import History from './history.js'
import './styles/roomList.css'

export default class RoomList extends Component {
  constructor(props) {
    super(props)
    this.state = {
      rooms: Client.client.getVisibleRooms(),
      sort: "Activity",
      memberLimit: document.body.offsetWidth > 400 ? 15 : 5,
      sortOrder: 1
    }
    // need to do this to bind "this" as refering to the RoomList component in the listener
    this.roomListener = this.roomListener.bind(this)
    this.resizeListener = this.resizeListener.bind(this)
  }

  roomListener () { this.setState({ rooms: Client.client.getVisibleRooms() }) }

  resizeListener() {
    clearTimeout(this.resizeDebounce)
    this.resizeDebounce = setTimeout(_ => {
      if (document.body.offsetWidth > 400) {
        if (this.state.memberLimit === 5) this.setState({memberLimit: 15})
      } else {
        if (this.state.memberLimit === 15) this.setState({memberLimit: 5})
      }
    }, 500)
  }

  componentDidMount () {
    window.addEventListener("resize", this.resizeListener)
    Client.client.on("Room", this.roomListener)
    Client.client.on("Room.name", this.roomListener)
    Client.client.on("RoomState.events", this.roomListener)
    Client.client.on("Room.accountData", this.roomListener)
    // State events might cause excessive rerendering, but we can optimize for that later
  }

  componentWillUnmount () {
    window.removeEventListener("resize", this.resizeListener)
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
    const searchWords = this.props.searchFilter.split(" ")
    for (const word of searchWords) {
      if (word.slice(0, 1) === '#') searchTags.push(word.slice(1))
      else if (word.slice(0, 1) === '@') searchMembers.push(word.slice(1))
      else if (word.slice(0, 1) === '~') searchFlags.push(word.slice(1))
      else searchNames.push(word)
    }
    return this.state.rooms.filter(room => {
      let flagged = true
      if (searchFlags.includes("fav")) { flagged = flagged && !!room.tags["m.favourite"] }
      const tags = Object.keys(room.tags).filter(tag => tag.slice(0, 2) === 'u.')
      // TODO: could make the below smarter to search by displayname as well as userID.
      const roomMembers = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getMembers().map(m => m.userId)
      return searchNames.every(name => room.name.toLowerCase().includes(name.toLowerCase())) &&
        searchMembers.every(member => roomMembers.some(roomMember => roomMember.toLowerCase().includes(member.toLowerCase()))) &&
        searchTags.every(searchTag => tags.some(tag => tag.toLowerCase().includes(searchTag.toLowerCase()))) &&
        flagged
    })
  }

  sortRooms = rooms => {
    return rooms.sort(this.getSortFunc())
      .map(room => {
        const pdfEvent = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents(pdfStateType, "")
        let result = null
        switch (room.getMyMembership()) {
          case "join" : {
            if (pdfEvent) {
              result = <PDFRoomEntry
                memberLimit={this.state.memberLimit}
                populateModal={this.props.populateModal}
                room={room}
                key={room.roomId}
                pdfevent={pdfEvent} />
            }
            break
          }
          case "invite" : {
            result = <InviteEntry room={room}
              key={room.roomId}
              roomListener={this.roomListener}
            />
          }
        }
        return result
      }).filter(room => room !== null)
  }

  render(_, state) {
    return (
      <Fragment>
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
      </Fragment>
    )
  }
}

class PDFRoomEntry extends Component {
  constructor(props) {
    super(props)
    const avatarEvent = props.room.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
      .getStateEvents("m.room.avatar", "")
    this.state = {
      buttonsVisible: false,
      memberListOpen: false,
      detailsOpen: false,
      avatarEvent,
      avatarUrl: avatarEvent?.getContent()?.url
        ? Client.client.mxcUrlToHttp(avatarEvent.getContent().url)
        : null
    }
  }

  componentDidMount () {
    Client.client.on("RoomState.events", this.handleStateUpdate)
  }

  handleStateUpdate = e => {
    if (e.getRoomId() === this.props.room.roomId && e.getType() === "m.room.avatar") {
      this.setState({
        avatarEvent: e,
        avatarUrl: e.getContent().url
          ? Client.client.getHttpUriForMxcFromHS(e.getContent().url)
          : null
      })
    }
  }

  getLastViewedPage = _ => this.props.room.getAccountData(lastViewed)
    ? this.props.room.getAccountData(lastViewed).getContent().page
    : 1

  toggleButtons = _ => this.setState(oldState => { return { buttonsVisible: !oldState.buttonsVisible } })

  toggleMemberList = _ => this.setState(oldState => { return { memberListOpen: !oldState.memberListOpen } })

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
    const userMember = props.room.getMember(Client.client.getUserId())
    const isAdmin = userMember.powerLevel >= 100
    const canInvite = props.room.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
      .hasSufficientPowerLevelFor("invite", userMember.powerLevel)
    const memberIds = members.map(member => member.userId)
    const memberPills = state.memberListOpen
      ? members.map(member => <MemberPill key={member.userId} member={member} />)
      : members.slice(0, props.memberLimit).map(member => <MemberPill key={member.userId} member={member} />)
    const invitePills = invites.map(invite => <span key={invite.userId} class="invite-pill"><MemberPill member={invite} /></span>)
    const avatarInfo = state.avatarEvent?.getContent()?.info
    // using max/min here rather than setting the height directly so that the height doesn't affect the object-fit: cover of the image,
    // But so that the div is still the right size prior to image-load
    const avatarListingStyle = avatarInfo ? { "min-height": Math.min(300, avatarInfo.h), "max-height": Math.min(300, avatarInfo.h) } : null
    const status = memberIds.includes(Client.client.getUserId())
      ? "joined"
      : "invited"
    return (
      <div data-room-status={status} class="room-listing-entry" id={props.room.roomId}>
        {state.avatarUrl
          ? <div style={avatarListingStyle} class="room-listing-avatar">
            <img src={state.avatarUrl} loading="lazy" alt="room avatar" />
          </div>
          : null
        }
        <div data-room-entry-buttons-visible={state.buttonsVisible} class="room-listing-body">
          <div class="room-listing-heading">
            {props.room.tags["m.favourite"] ? <span class="fav-star"> {Icons.star} </span> : null}
            <a href={`${window.location.origin}${window.location.pathname}#/${encodeURIComponent(props.room.getCanonicalAlias().slice(1))}/${this.getLastViewedPage()}`}>{props.room.name}</a>
          </div>
          <div class="room-listing-data">
            <TagList room={props.room} />
            <div class="room-listing-data-row">
              <span class="room-data-icon">{Icons.userMany}</span><Fragment>{memberPills}</Fragment><Fragment>{invitePills}</Fragment>
              { state.memberListOpen || members.length <= props.memberLimit
                ? null
                : <button onclick={this.toggleMemberList}
                    class="room-more-members">and {members.length - props.memberLimit} more.
                </button>
              }
            </div>
          </div>
          <AnnotationData getLastViewedPage={this.getLastViewedPage} room={props.room} />
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
    )
  }
}

class AnnotationData extends Component {
  constructor(props) {
    super(props)
    this.state = {
      annotationContents: []
    }
    this.handleTimeline = this.handleTimeline.bind(this)
    this.handleStateUpdate = this.handleStateUpdate.bind(this)
    this.handleInitialSync = this.handleInitialSync.bind(this)
    this.unreadCounts = {}
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
    const annotationContents = this.props.room.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild)
      .map(ev => {
        const content = ev.getContent()
        if (!(ev.getStateKey() in this.unreadCounts)) {
          this.unreadCounts[ev.getStateKey()] = calculateUnread(ev.getStateKey())
        }
        content.unread = this.unreadCounts[ev.getStateKey()]
        return content
      })
      .filter(content => content[eventVersion] && content[eventVersion].activityStatus === "open")
    this.setState({annotationContents})
  }

  handleStateUpdate = e => {
    if (e.getRoomId() === this.props.room.roomId && e.getType() === spaceChild) {
      this.updateAnnotations()
    }
  }

  handleTimeline (_event, room) {
    // room is null if it's a notification timeline event
    if (room?.roomId in this.unreadCounts) {
      this.unreadCounts[room.roomId] = calculateUnread(room.roomId)
      this.updateAnnotations()
    }
  }

  handleLoadNew = _ => {
    History.push(
      `/${encodeURIComponent(this.props.room.getCanonicalAlias().slice(1))}/${this.props.getLastViewedPage() || 1}/`,
      {searchString: "~unread"}
    )
  }

  getUnreadCount = _ => this.state.annotationContents.filter(content => content.unread).length

  render() {
    const unread = this.getUnreadCount()
    return <div class="room-annotation-data">
      <span title="Unread conversations" onClick={this.handleLoadNew}>
        <button class="small-icon">{Icons.annotation}</button>
        {unread > 0 ? <span class="small-icon-badge">{unread}</span> : null}
      </span>
    </div>
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
