import { h, Fragment, Component, createRef } from 'preact';
import { lastViewed } from "./constants.js"
import { decode } from "blurhash"
import Resource from "./utils/resource.js"
import Location from "./utils/location.js"
import * as Matrix from "matrix-js-sdk"
import MemberPill from './memberPill.js'
import Client from './client.js'
import Modal from './modal.js'
import ManageMembership from './manageMembership.js'
import LeaveRoom from './leaveRoom.js'
import { TagEditor, TagList } from './tagEditor.js'
import ToolTip from "./utils/tooltip.js"
import RoomSettings from './roomSettings.js'
import { RoomColor } from './utils/colors.js'
import { toWords } from './utils/strings.js'
import * as Icons from './icons.js'
import History from './history.js'
import './styles/roomList.css'

export default class RoomList extends Component {
  constructor(props) {
    super(props)
    this.state = {
      rooms: Client.client.getVisibleRooms().filter(Resource.hasResource),
      sort: "ACTIVITY",
      sortOrder: 1,
      memberLimit:15
    }
  }

  componentDidMount () {
    Client.client.on("Room", this.roomListener)
    Client.client.on("Room.name", this.roomListener)
    Client.client.on("RoomState.events", this.roomListener)
    Client.client.on("Room.accountData", this.roomListener)
    // State events might cause excessive rerendering, but we can optimize for that later
    this.resetMemberLimit()
    window.addEventListener("resize", this.resizeListener)
  }

  componentWillUnmount () {
    Client.client.off("Room", this.roomListener)
    Client.client.off("Room.name", this.roomListener)
    Client.client.off("RoomState.events", this.roomListener)
    Client.client.off("Room.accountData", this.roomListener)
    window.removeEventListener("resize", this.resizeListener)
  }

  roomList = createRef()

  roomListener = _ => {
    clearTimeout(this.roomDebounceTimeout)
    this.roomDebounceTimeout = setTimeout(_ => {
      this.setState({
        rooms: Client.client.getVisibleRooms()
          .filter(Resource.hasResource)
          .filter(room => room.getMyMembership() === "join")
      })
    }, 1000)
  }

  resizeListener = _ => {
    clearTimeout(this.resizeDebounceTimeout)
    this.resizeDebounceTimeout = setTimeout(this.resetMemberLimit, 500)
  }

  resetMemberLimit = _ => {
    if (this.roomList.current) {
      this.roomList.current.clientWidth > 500 ? this.setState({memberLimit: 15})
        : this.roomList.current.clientWidth > 300 ? this.setState({memberLimit: 5})
        : this.setState({memberLimit: 2})
    }
  }

  byActivity = (a, b) => {
    const ts1 = a.getLastActiveTimestamp()
    const ts2 = b.getLastActiveTimestamp()
    if (ts1 < ts2) return 1 * this.state.sortOrder
    else if (ts2 < ts1) return -1 * this.state.sortOrder
    return 0
  }

  byName = (a, b) => {
    const n1 = a.name
    const n2 = b.name
    if (n1 < n2) return 1 * this.state.sortOrder
    else if (n2 < n1) return -1 * this.state.sortOrder
    return 0
  }

  byCreation = (a, b) => {
    const c1 = a.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
      .getStateEvents(Matrix.EventType.RoomCreate,"")
      .getTs()
    const c2 = b.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
      .getStateEvents(Matrix.EventType.RoomCreate,"")
      .getTs()
    if (c1 < c2) return 1 * this.state.sortOrder
    else if (c2 < c1) return -1 * this.state.sortOrder
    return 0
  }

  sortByActivity = _ => {
    this.setState(oldState =>
      oldState.sort === "ACTIVITY"
        ? { sortOrder: oldState.sortOrder * -1 }
        : { sort: "ACTIVITY" }
    )
  }

  sortByName = _ => {
    this.setState(oldState =>
      oldState.sort === "NAME"
        ? { sortOrder: oldState.sortOrder * -1 }
        : { sort: "NAME" }
    )
  }

  sortByCreation = _ => {
    this.setState(oldState =>
      oldState.sort === "CREATION"
        ? { sortOrder: oldState.sortOrder * -1 }
        : { sort: "CREATION" }
    )
  }

  flipSort = _ => {
    this.setState(oldState => {
      return { sortOrder: oldState.sortOrder * -1 }
    })
  }

  getSortFunc() {
    switch (this.state.sort) {
      case 'CREATION': return this.byCreation
      case 'ACTIVITY': return this.byActivity
      case 'NAME': return this.byName
    }
  }

  searchRooms = searchWords => {
    // TODO: We're going to want to have different subcategories of rooms,
    // for actual pdfs, and for annotation discussions
    const searchNames = []
    const searchTags = []
    const searchMembers = []
    const searchFlags = []
    const searchParents = []
    const searchIds = []
    for (const word of searchWords) {
      if (word.slice(0, 1) === '#') searchTags.push(word.slice(1))
      else if (word.slice(0, 1) === '@') searchMembers.push(word.slice(1))
      else if (word.slice(0, 1) === '*') searchParents.push(word.slice(1))
      else if (word.slice(0, 1) === '~') searchFlags.push(word.slice(1))
      else if (word.slice(0, 1) === '!') searchIds.push(word)
      else searchNames.push(word)
    }
    // XXX ↓ very naive implementation, watch for speed
    return this.state.rooms.filter(room => {
      let flagged = true
      if (searchFlags.includes("fav")) { flagged = flagged && !!room.tags["m.favourite"] }
      const tags = Object.keys(room.tags).filter(tag => tag.slice(0, 2) === 'u.')
      const state = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
      // TODO: could make the below smarter to search by displayname as well as userID.
      const inRoom = state.getMembers().filter(u => u.membership === "join" || u.membership === "invite")
      const roomMemberIds = inRoom.map(m => m.userId)
      const roomMemberNames = inRoom.map(m => m.name)
      const roomMembers = roomMemberIds.concat(roomMemberNames)
      const parents = state.getStateEvents("m.space.parent")
        .filter(e => !!e.getContent().via)
        .map(e => Client.client.getRoom(e.getStateKey())?.name)
        .filter(e => e)
      return searchNames.every(name => room.name.toLowerCase().includes(name.toLowerCase())) &&
        (searchIds.length > 0 ? searchIds.some(id => room.roomId === id) : true) &&
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
            memberLimit={this.state.memberLimit}
            room={room}
            key={room.roomId} />
        }
        return result
      }).filter(room => room !== null)
  }

  render(props, state) {
    return <div id="room-list" ref={this.roomList}>
      <div id="select-sort">
        <button class="small-icon"
          style="cursor: pointer"
          onClick={this.flipSort}>
          {state.sortOrder === 1
            ? Icons.sortDesc
            : Icons.sortAsc
          }
        </button>
        <button data-current-button={state.sort === "ACTIVITY"}
                onClick={this.sortByActivity}
                class="styled-button">Зміни</button>
        <button data-current-button={state.sort === "NAME"}
                onClick={this.sortByName}
                class="styled-button">Назва</button>
        <button data-current-button={state.sort === "CREATION"}
                onClick={this.sortByCreation}
                class="styled-button">Створення</button>
      </div>
      <FilterList setFilterItems={props.setFilterItems} filterItems={props.filterItems} />
      {/* TODO: We're probably going to need to debounce this rather than searching with each render, for longer lists of rooms */}
      <div>{this.sortRooms(this.searchRooms(toWords(props.searchFilter).concat(props.filterItems.map(item => item.value))))}</div>
    </div>
  }
}

class FilterList extends Component {
  removeFilter = item => this.props.setFilterItems(this.props.filterItems.filter(x => x.value !== item.value))

  render(props) {
    if (props.filterItems.length > 0) {
      return <div id="room-filters">
        Filters: {props.filterItems.map(item =>
          <FilterListing removeFilter={this.removeFilter} key={item.value} filter={item} />
      )}
      </div>
    }
  }
}

class FilterListing extends Component {
  removeMe = _ => { this.props.removeFilter(this.props.filter) }

  render(props) {
    return <span class="room-filter-listing" >
      <span class="room-filter-content">{props.filter.display}</span>
      <button onclick={this.removeMe}class="small-icon-badge">{Icons.close}</button>
    </span>
  }
}

class RoomEntry extends Component {
  constructor(props) {
    super(props)
    this.state = { buttonsVisible: false }
  }

  roomColor = new RoomColor(this.props.room.roomId)

  toggleButtons = _ => this.setState(oldState => { return { buttonsVisible: !oldState.buttonsVisible } })

  openMembership = _ => Modal.set(<ManageMembership room={this.props.room} />, "Керування учасниками", `для ${this.props.room.name}`)

  openSettings = _ => Modal.set(<RoomSettings joinLink={true} room={this.props.room} />, "Налаштування", `для ${this.props.room.name}`)

  handleEditTags = _ => Modal.set(<TagEditor room={this.props.room} />, "Редагувати теги", `для ${this.props.room.name}`)

  toggleFavorite = _ => {
    if (this.props.room.tags["m.favourite"]) Client.client.deleteRoomTag(this.props.room.roomId, "m.favourite")
    else Client.client.setRoomTag(this.props.room.roomId, "m.favourite", {order: 0.5})
  }

  handleClose = _ => Modal.set(<LeaveRoom room={this.props.room} />, "Видалити запис?", ` ${this.props.room.name}`)

  render (props, state) {
    const userMember = props.room.getMember(Client.client.getUserId())
    const isAdmin = userMember.powerLevel >= 100
    const canInvite = props.room.getLiveTimeline()
      .getState(Matrix.EventTimeline.FORWARDS)
      .hasSufficientPowerLevelFor("invite", userMember.powerLevel)
    const canonicalAlias = props.room.getCanonicalAlias()?.slice(1)
    if (canonicalAlias) return <div style={this.roomColor.styleVariables} class="room-listing-entry" id={props.room.roomId}>
      <AvatarPanel room={props.room} />
      <div data-room-entry-buttons-visible={state.buttonsVisible} class="room-listing-body">
        <div class="room-listing-heading">
          {props.room.tags["m.favourite"] ? <span class="fav-star"> {Icons.star} </span> : null}
          <a href={`${window.location.origin}${window.location.pathname}#/${encodeURIComponent(canonicalAlias)}/`}>{props.room.name}</a>
        </div>
        <div class="room-listing-data">
          <RoomTagListing room={props.room} />
          <MemberListing room= {props.room} memberLimit={props.memberLimit} />
        </div>
        <div class="room-listing-entry-buttons">
          { state.buttonsVisible ? null : <ToolTip placement="right" content="Перемикачі"><button onClick={this.toggleButtons}>{Icons.moreVertical}</button></ToolTip>}
          { state.buttonsVisible ? <ToolTip placement="right" content="Перемикачі"><button onClick={this.toggleButtons}>{Icons.close}</button> </ToolTip> : null }
          { state.buttonsVisible ? <ToolTip placement="right" content="Додати в обране"><button onClick={this.toggleFavorite}>{Icons.star}</button></ToolTip> : null }
          { state.buttonsVisible ? <ToolTip placement="right" content="Вийти"><button onClick={this.handleClose}>{Icons.exit}</button></ToolTip> : null }
          { state.buttonsVisible ? <ToolTip placement="right" content="Редагування тегів"><button onClick={this.handleEditTags}>{Icons.tag}</button></ToolTip> : null }
          { state.buttonsVisible && canInvite ? <ToolTip placement="right" content="Управління членством"><button onClick={this.openMembership}>{Icons.userPlus}</button></ToolTip> : null }
          { state.buttonsVisible && isAdmin ? <ToolTip placement="right" content="Змінити алаштування"><button onClick={this.openSettings}>{Icons.settings}</button></ToolTip> : null }
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
    this.drawBlurhash()
  }

  componentWillUnmount () {
    Client.client.off("RoomState.events", this.handleStateUpdate)
  }

  avatarCanvas = createRef()

  handleStateUpdate = e => {
    if (e.getRoomId() === this.props.room.roomId && e.getType() === "m.room.avatar") {
      this.setState({
        avatarEvent: e,
        avatarUrl: e.getContent().url
          ? Client.client.getHttpUriForMxcFromHS(e.getContent().url, 800, 600, "scale")
          : null
      }, this.drawBlurhash)
    }
  }

  handleLoad = _ => this.setState({ loaded: true })

  drawBlurhash = _ => {
    const avatarInfo = this.state.avatarEvent?.getContent()?.info
    if (!avatarInfo?.h || !avatarInfo?.w || !avatarInfo?.blurhash) return
    const ctx = this.avatarCanvas.current.getContext("2d")
    ctx.clearRect(0, 0, this.avatarCanvas.current.wdith, this.avatarCanvas.current.height)
    // we draw them small and scale up in CSS, following blurhash developer's advice
    const width = 32
    const height = Math.floor(32 * (avatarInfo.h / avatarInfo.w))
    this.avatarCanvas.current.width = width
    this.avatarCanvas.current.height = height
    const imageData = ctx.createImageData(width, height);
    const pixels = decode(avatarInfo.blurhash, width, height)
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
  }

  render(props, state) {
    const avatarInfo = state.avatarEvent?.getContent()?.info
    // using max/min here rather than setting the height directly so that the height doesn't affect the object-fit: cover of the image,
    // But so that the div is still the right size prior to image-load
    const avatarListingStyle = avatarInfo
      ? { "min-height": Math.min(300, avatarInfo.h), "max-height": Math.min(300, avatarInfo.h) }
      : null
    const avatarCanvasStyle = avatarInfo
      ? { "min-height": Math.min(300, avatarInfo.h), "max-height": Math.min(300, avatarInfo.h), "width": "100%" }
      : null
    return <div style={avatarListingStyle} data-has-avatar={!!state.avatarUrl} class="room-listing-avatar">
      {state.avatarUrl
        ? <Fragment>
          <canvas 
            ref={this.avatarCanvas}
            style={avatarCanvasStyle}
            class="room-listing-avatar-canvas" />
          <img src={state.avatarUrl}
            onLoad={this.handleLoad}
            class="room-listing-avatar-img"
            data-avatar-loaded={state.loaded}
            loading="lazy"
            alt="room avatar" />
        </Fragment>
        : null
      }
      <AnnotationData room={props.room} />
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
      .getState(Matrix.EventTimeline.FORWARDS).getStateEvents(Matrix.EventType.SpaceChild)
      .map(ev => new Location(ev))
      .filter(loc => loc.isValid() && loc.getStatus() === "open")
    this.setState({annotations})
  }

  handleStateUpdate = e => {
    if (e.getRoomId() === this.props.room.roomId && e.getType() === Matrix.EventType.SpaceChild) {
      this.updateAnnotations()
    }
  }

  handleTimeline (_event, room) {
    const childIds = this.state.annotations.map(loc => loc.getChild())
    if (room?.roomId in childIds) this.updateAnnotations()
  }

  handleLoadNew = _ => {
    const canonicalAlias = this.props.room.getCanonicalAlias()?.slice(1)
    if (canonicalAlias) History.push(
      `/${encodeURIComponent(canonicalAlias)}/`,
      {searchString: "~unread"}
    )
  }

  getUnreadCount = _ => this.state.annotations.filter(loc => loc.getUnread()).length

  render() {
    const unread = this.getUnreadCount()
    return <div class="room-annotation-data">
      {unread < 1
        ? null
        : <ToolTip placement="right" content="Unread conversations">
          <span onClick={this.handleLoadNew}>
            <button class="small-icon">{Icons.annotation}</button>
            <span class="small-icon-badge">{unread}</span>
          </span>
        </ToolTip>
      }
    </div>
  }
}
