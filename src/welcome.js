import { h, Fragment, Component } from 'preact';
import * as Matrix from "matrix-js-sdk"
import { UserColor } from './utils/colors.js'
import PdfUpload from './pdfUpload.js'
import RoomList from './roomList.js'
import SpacesManager from './spacesManager.js'
import Client from './client.js'
import SearchBar from './search.js'
import { toWords } from './utils/strings.js'
import ProfileInformation from './profileInformation.js'
import NotificationListing from './notifications.js'
import * as Icons from './icons.js'
import SyncIndicator from './syncIndicator.js'
import { mscResourceData } from "./constants.js"
import './styles/welcome.css'

export default class WelcomeView extends Component {
  constructor(props) {
    super(props)
    this.state = {
      view: null,
      inputFocus: false,
      searchFilter: "",
      filterItems: [],
      narrow: document.body.offsetWidth <= 600,
    }
  }

  componentDidMount () {
    window.addEventListener("resize", this.resizeListener)
  }

  componentWillUnmount () {
    window.removeEventListener("resize", this.resizeListener)
  }

  resizeListener = _ => {
    clearTimeout(this.resizeDebounce)
    this.resizeDebounce = setTimeout(_ => document.body.offsetWidth > 600
      ? this.state.narrow
        ? this.setState({
          view: this.state.view === "COLLECTION" ? null : this.state.view,
          narrow: false
        })
        : null
      : !this.state.narrow
          ? this.setState({narrow: true})
          : null
    , 500)
  }

  setSearch = s => this.setState({ searchFilter: s})

  setFilterItems = s => this.setState({ filterItems: s})

  submitSearch = _ => {
    this.setState(oldState => {
      return {
        searchFilter: "",
        filterItems: oldState.filterItems.concat(
          toWords(oldState.searchFilter).map(word => { return { display: word, value: word} })
        )
      }
    })
  }

  setFocus = b => this.setState({
    inputFocus: b,
    view: null
  })

  toggleUploadVisible = _ => this.setState(oldState =>
    oldState.view === "UPLOAD"
      ? { view: null }
      : { view: "UPLOAD" }
  )

  toggleProfileVisible = _ => this.setState(oldState =>
    oldState.view === "PROFILE"
      ? { view: null }
      : { view: "PROFILE" }
  )

  toggleNotifVisible = _ => this.setState(oldState =>
    oldState.view === "NOTIF"
      ? { view: null }
      : { view: "NOTIF" }
  )

  toggleCollectionVisible = _ => this.setState(oldState =>
    oldState.view === "COLLECTION"
      ? { view: null }
      : { view: "COLLECTION" }
  )

  showMainView = _ => this.setState({ view: null })

  render(props, state) {
    return <Fragment key="welcome-fragment">
      <header id="welcome-header">
        <div id="welcome-header-content">
          <SearchBar
            search={state.searchFilter}
            setSearch={this.setSearch}
            submit={this.submitSearch}
            hint="/"
            setFocus={this.setFocus} />
          { !state.inputFocus && <Fragment>
            {state.narrow
              ? <button data-active={state.view === "COLLECTION"} id="welcome-collection" onClick={this.toggleCollectionVisible}>{Icons.collection}</button>
              : null
            }
            <button data-active={state.view === "UPLOAD"} id="welcome-upload" onClick={this.toggleUploadVisible}>{Icons.newFile}</button>
            <WelcomeIcon active={state.view === "NOTIF"} toggleNotifVisible={this.toggleNotifVisible} />
            <WelcomeProfile active={state.view === "PROFILE"} toggleProfileVisible={this.toggleProfileVisible}  />
          </Fragment>}
        </div>
      </header>
      <div id="welcome-container">
        {state.view === "UPLOAD"
          ? <PdfUpload showMainView={this.showMainView} />
          : state.view === "PROFILE"
            ? <ProfileInformation logoutHandler={props.logoutHandler} showMainView={this.showMainView} />
            : state.view === "NOTIF"
              ? <NotificationListing />
              : state.view === "COLLECTION"
                ? <div class="welcome-column">
                    <SpacesManager narrow={state.narrow} showMainView={this.showMainView} setFilterItems={this.setFilterItems} filterItems={state.filterItems} />
                </div>
                : state.narrow
                  ? <RoomList narrow={state.narrow} setFilterItems={this.setFilterItems} filterItems={state.filterItems} searchFilter={state.searchFilter} />
                  : <div id="welcome-split">
                    <SpacesManager setFilterItems={this.setFilterItems} filterItems={state.filterItems} narrow={state.narrow} />
                    <RoomList narrow={state.narrow} setFilterItems={this.setFilterItems} filterItems={state.filterItems} searchFilter={state.searchFilter} />
                  </div>
        }
      </div>
      <SyncIndicator />
    </Fragment>
  }
}

class WelcomeIcon extends Component {
  constructor(props) {
    super(props)
    const unread = Client.client.getVisibleRooms()
      .reduce((acc, room) => acc + (room.getUnreadNotificationCount("highlight") || 0), 0)
    const invites = Client.client.getVisibleRooms()
      .filter(room => room.getMyMembership() === "invite")
      .filter(room => room
        .getLiveTimeline()
        .getState(Matrix.EventTimeline.FORWARDS)
        .getStateEvents("m.room.create", "")
        ?.getContent()?.type === "m.space")
      .length
    this.state = { count: unread + invites}
    this.updateCount = this.updateCount.bind(this)
  }

  componentDidMount() {
    Client.client.on("sync", this.updateCount)
    Client.client.on("RoomState.events", this.updateCount) // needed to update when creation event arrives
  }

  componentWillUnmount() {
    Client.client.off("sync", this.updateCount)
    Client.client.off("RoomState.events", this.updateCount) // needed to update when creation event arrives
  }

  updateCount() {
    const unread = Client.client.getVisibleRooms()
      .reduce((acc, room) => acc + (room.getUnreadNotificationCount("highlight") || 0), 0)
    const invites = Client.client.getVisibleRooms()
      .filter(room => room.getMyMembership() === "invite")
      .filter(room => room
        .getLiveTimeline()
        .getState(Matrix.EventTimeline.FORWARDS)
        .getStateEvents("m.room.create", "")
        ?.getContent()?.[mscResourceData])
      .length
    this.setState({ count: unread + invites})
  }

  render(props, state) {
    return <button data-active={props.active} id="welcome-notifications" onClick={props.toggleNotifVisible}>
      {Icons.bell}
      {state.count > 0 ? <span class="small-icon-badge">{state.count}</span> : null}
    </button>
  }
}

class WelcomeProfile extends Component {
  constructor(props) {
    super(props)
    const userId = Client.client.getUserId()
    this.user = Client.client.getUser(userId)
    this.userColor = new UserColor(userId)
    this.state = {
      avatarUrl: Client.client.getHttpUriForMxcFromHS(this.user.avatarUrl, 30, 30, "crop")
    }
  }

  componentDidMount () {
    Client.client.on("sync", this.profileListener)
  }

  componentWillUnmount () {
    Client.client.off("sync", this.profileListener)
  }

  profileListener = _ => {
    this.setState({
      avatarUrl: Client.client.getHttpUriForMxcFromHS(this.user.avatarUrl, 30, 30, "crop")
    })
  }

  displayInitial = _ => {
    return this.user.displayName.slice(0, 1) === '@'
      ? this.user.displayName.slice(1, 2)
      : this.user.displayName.slice(0, 1)
  }

  render(props, state) {
    return <button data-active={props.active} id="welcome-profile" onClick={props.toggleProfileVisible} style={this.userColor.styleVariables} >
      {state.avatarUrl
        ? <img id="welcome-img" src={state.avatarUrl} />
        : <span id="welcome-initial">{this.displayInitial()}</span>
      }
    </button>
  }
}
