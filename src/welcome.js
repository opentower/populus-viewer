import { h, Fragment, Component } from 'preact';
import { pdfStateType, eventVersion, spaceChild, lastViewed } from "./constants.js"
import * as Matrix from "matrix-js-sdk"
import UserColor from './userColors.js'
import PdfUpload from './pdfUpload.js'
import MemberPill from './memberPill.js'
import QueryParameters from './queryParams.js'
import Client from './client.js'
import ProfileInformation from './profileInformation.js'
import Invite from './invite.js'
import RoomSettings from './roomSettings.js'
import * as Icons from './icons.js'
import { calculateUnread } from './utils/unread.js'
import Modal from './modal.js'
import Toast from './toast.js'
import './styles/welcome.css'

export default class WelcomeView extends Component {
  constructor(props) {
    super(props)
    const userId = Client.client.getUserId()
    this.user = Client.client.getUser(Client.client.getUserId())
    this.userColor = new UserColor(userId)
    this.profileListener = this.profileListener.bind(this)
    this.state = {
      uploadVisible: false,
      profileVisible: false,
      inputFocus: false,
      searchFilter: "",
      avatarUrl: Client.client.getHttpUriForMxcFromHS(this.user.avatarUrl, 30, 30, "crop")
    }
  }

  componentDidMount () { this.user.on("User.avatarUrl", this.profileListener) }

  componentWillUnmount () { this.user.off("User.avatarUrl", this.profileListener) }

  profileListener () {
    this.setState({
      avatarUrl: Client.client.getHttpUriForMxcFromHS(this.user.avatarUrl, 30, 30, "crop")
    })
  }

  toggleUploadVisible = _ => this.setState({
    uploadVisible: !this.state.uploadVisible,
    profileVisible: false
  })

  toggleProfileVisible = _ => this.setState({
    uploadVisible: false,
    profileVisible: !this.state.profileVisible
  })

  emptyModal = _ => this.setState({ modalContent: null })

  populateModal = s => this.setState({ modalContent: s })

  emptyToast = _ => this.setState({ toastContent: null })

  populateToast = s => this.setState({ toastContent: s })

  showMainView = _ => this.setState({
    uploadVisible: false,
    profileVisible: false
  })

  handleInputFocus = _ => this.setState({
    inputFocus: true,
    uploadVisible: false,
    profileVisible: false
  })

  handleInputBlur = _ => this.setState({inputFocus: false})

  handleInput = e => {
    this.setState({searchFilter: e.target.value})
  }

  displayInitial = _ => {
    return this.user.displayName.slice(0, 1) === '@'
      ? this.user.displayName.slice(1, 2)
      : this.user.displayName.slice(0, 1)
  }

  render(props, state) {
    return (
      <Fragment key="welcome-fragment">
        <Modal modalVisible={!!state.modalContent} hideModal={this.emptyModal}>{state.modalContent}</Modal>
        <Toast toastVisible={!!state.toastContent} hideToast={this.emptyToast}>{state.toastContent}</Toast>
        <header id="welcome-header">
          <div id="welcome-header-content">
            <div id="welcome-search">
              <input value={state.searchFilter} onInput={this.handleInput} onBlur={this.handleInputBlur} onFocus={this.handleInputFocus} id="welcome-search-input" />
              {Icons.search}
            </div>
            { !state.inputFocus && <Fragment>
              <div id="welcome-upload" onClick={this.toggleUploadVisible}>{Icons.newFile}</div>
              <div id="welcome-profile" onClick={this.toggleProfileVisible} style={this.userColor.styleVariables} >
                {state.avatarUrl
                  ? <img id="welcome-img" src={state.avatarUrl} />
                  : <div id="welcome-initial">{this.displayInitial()}</div>
                }
              </div>
            </Fragment>}
          </div>
        </header>
        <div id="welcome-container">
          {state.uploadVisible
            ? <Fragment>
              <h2>Upload a new PDF</h2>
              <PdfUpload showMainView={this.showMainView} />
            </Fragment>
            : state.profileVisible
              ? <Fragment>
                <h2>Update Your Profile</h2>
                <ProfileInformation logoutHandler={props.logoutHandler} showMainView={this.showMainView} />
              </Fragment>
              : <Fragment>
                <RoomList searchFilter={state.searchFilter}
                  pushHistory={props.pushHistory}
                  populateModal={this.populateModal}
                />
              </Fragment>
          }
        </div>
      </Fragment>
    )
  }
}

class RoomList extends Component {
  constructor(props) {
    super(props)
    this.state = {
      rooms: Client.client.getVisibleRooms(),
      sort: "Activity"
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

  byActivity(a, b) {
    const ts1 = a.getLastActiveTimestamp()
    const ts2 = b.getLastActiveTimestamp()
    if (ts1 < ts2) return 1
    else if (ts2 < ts1) return -1
    return 0
  }

  byName(a, b) {
    const ts1 = a.name
    const ts2 = b.name
    if (ts1 < ts2) return 1
    else if (ts2 < ts1) return -1
    return 0
  }

  byFavorite() { return 0 }

  sortByActivity = _ => this.setState({ sort: "Activity" })

  sortByName = _ => this.setState({ sort: "Name" })

  sortByFavorite = _ => this.setState({ sort: "Favorite" })

  getSortFunc() {
    switch (this.state.sort) {
      case 'Activity': return this.byActivity
      case 'Name': return this.byName
      case 'Favorite': return this.byFavorite
    }
  }

  render(props, state) {
    // TODO: We're going to want to have different subcategories of rooms,
    // for actual pdfs, and for annotation discussions
    const rooms = state.rooms.filter(room => {
      const search = room.name.toLowerCase().includes(props.searchFilter.toLowerCase())
      const favorite = state.sort !== "Favorite" || room.tags["m.favourite"]
      return search && favorite
    }).sort(this.getSortFunc())
      .map(room => {
        const pdfEvent = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents(pdfStateType, "")
        const annotations = room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild)
        let result = null
        switch (room.getMyMembership()) {
          case "join" : {
            if (pdfEvent) {
              result = <PDFRoomEntry annotations={annotations}
                pushHistory={props.pushHistory}
                populateModal={props.populateModal}
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
    return (
      <Fragment>
        <div id="select-sort">
          <span id="select-sort-icon" />
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
        <div>{rooms}</div>
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
      pdfFocused: this.props.room.name,
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

  toggleFavorite = _ => {
    if (this.props.room.tags["m.favourite"]) Client.client.deleteRoomTag(this.props.room.roomId, "m.favourite")
    else Client.client.setRoomTag(this.props.room.roomId, "m.favourite", {order: 0.5})
  }

  handleClose = _ => Client.client.leave(this.props.room.roomId)

  handleDetailsToggle = _ => this.setState({ detailsOpen: !this.state.detailsOpen })

  render (props, state) {
    const date = new Date(props.room.getLastActiveTimestamp())
    const members = props.room.getJoinedMembers()
    const memberIds = members.map(member => member.userId)
    const memberPills = members.map(member => <MemberPill key={member.userId} member={member} />)
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
          <span>Members: </span><div>{memberPills}</div>
          <span>Last Active:</span><div>{date.toLocaleString('en-US', {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "numeric",
            second: "numeric"
          })}</div>
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
        </div>
      </div>
    )
  }
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
      pdfFocused: this.props.parentRoom.name
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
      <div>…&nbsp;<a onClick={this.handleClick}>{props.annotationContent.selectedText}</a>&nbsp;…</div>
      <div class="annotation-room-entry-data">
        <div class="annotation-room-page">p: {props.annotationContent.pageNumber}</div>
        <div class="annotation-room-unread">{Icons.bell}&nbsp;{state.unreadCount}</div>
      </div>
    </div>
  }
}
