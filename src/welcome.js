import { h, Fragment, createRef, Component } from 'preact';
import * as Matrix from "matrix-js-sdk"
import { UserColor } from './utils/colors.js'
import FileUpload from './fileUpload.js'
import RoomList from './roomList.js'
import SpacesManager from './spacesManager.js'
import Client from './client.js'
import SearchBar from './search.js'
import { toWords } from './utils/strings.js'
import ToolTip from "./utils/tooltip.js"
import * as PopupMenu from './popUpMenu.js'
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
      layout: document.body.offsetWidth > 750
        ? "wide"
        : document.body.offsetWidth > 400
          ? "narrow"
          : "phone"
    }
  }

  componentDidMount () {
    window.addEventListener("resize", this.resizeListener)
  }

  componentWillUnmount () {
    window.removeEventListener("resize", this.resizeListener)
  }

  resizeListener = _ => {
    clearTimeout(this.resizeDebounceTimeout)
    this.resizeDebounceTimeout = setTimeout(_ => {
      if (document.body.offsetWidth > 750) {
        if (this.state.layout !== "wide") {
          this.setState({
            view: this.state.view === "COLLECTION" ? null : this.state.view,
            layout: "wide"
          })
        }
      } else if (document.body.offsetWidth > 400 ) {
        if (this.state.layout !== "narrow") this.setState({layout: "narrow"})
      } else if (document.body.offsetWidth <= 400 ) {
        if (this.state.layout !== "phone") this.setState({layout: "phone"})
      }
    }, 500)
  }

  searchInput = createRef()

  popupMenu = createRef()

  setSearch = s => this.setState({ searchFilter: s})

  setFilterItems = s => this.setState({ filterItems: s})

  submitSearch = _ => {
    if (this.popupMenu.current.state.active) return
    this.setState(oldState => {
      return {
        searchFilter: "",
        filterItems: oldState.filterItems.concat(
          toWords(oldState.searchFilter).map(word => { return { display: word, value: word} })
        )
      }
    })
  }

  flags = [
    { keyword: "fav", description: "favorite discussions" },
  ]

  popupActions = { 
    "@": props => <PopupMenu.Users {...props} />,
    "~": props => <PopupMenu.Flags flags={this.flags} {...props} />
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
          <div id="welcome-search-wrapper">
            <SearchBar
              search={state.searchFilter}
              setSearch={this.setSearch}
              searchInput={this.searchInput}
              submit={this.submitSearch}
              hint="/"
              setFocus={this.setFocus} />
            <PopupMenu.Menu
              below={true}
              ref={this.popupMenu}
              textValue={state.searchFilter}
              textarea={this.searchInput}
              actions={this.popupActions}
              setTextValue={this.setSearch}
            />
          </div>
          { (!state.inputFocus || !(state.layout !== "wide")) && <Fragment>
            {state.layout !== "wide"
              ? <ToolTip placement="below" content="Collection View">
                <button
                  data-active={state.view === "COLLECTION"} 
                  id="welcome-collection"
                  onClick={this.toggleCollectionVisible}>
                  {Icons.collection}
                </button>
              </ToolTip>
              : null
            }
            <UploadIcon active={state.view === "UPLOAD"} toggleUploadVisible={this.toggleUploadVisible}/>
            <WelcomeIcon active={state.view === "NOTIF"} toggleNotifVisible={this.toggleNotifVisible} />
            <WelcomeProfile active={state.view === "PROFILE"} toggleProfileVisible={this.toggleProfileVisible} />
          </Fragment>}
        </div>
      </header>
      <div id="welcome-container">
        {state.view === "UPLOAD"
          ? <FileUpload showMainView={this.showMainView} />
          : state.view === "PROFILE"
            ? <ProfileInformation logoutHandler={props.logoutHandler} showMainView={this.showMainView} />
            : state.view === "NOTIF"
              ? <NotificationListing />
              : state.view === "COLLECTION"
                ? <div class="welcome-column">
                  <SpacesManager oneColumn showMainView={this.showMainView} setFilterItems={this.setFilterItems} filterItems={state.filterItems} />
                </div>
                : state.layout !== "wide"
                  ? <div class="welcome-column">
                    <RoomList setFilterItems={this.setFilterItems} filterItems={state.filterItems} searchFilter={state.searchFilter} />
                  </div>
                  : <div id="welcome-split">
                    <RoomList setFilterItems={this.setFilterItems} filterItems={state.filterItems} searchFilter={state.searchFilter} />
                    <div>
                      <SpacesManager setFilterItems={this.setFilterItems} filterItems={state.filterItems} />
                      <AboutCard />
                    </div>
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
    return <ToolTip position="below" content="View notifications">
        <button data-active={props.active} id="welcome-notifications" onClick={props.toggleNotifVisible}>
        {Icons.bell}
        {state.count > 0 ? <span class="small-icon-badge">{state.count}</span> : null}
      </button>
    </ToolTip>
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
    return <ToolTip position="below" content="View profile">
      <button data-active={props.active}
        id="welcome-profile"
        onClick={props.toggleProfileVisible}
        style={this.userColor.styleVariables} >
        {state.avatarUrl
          ? <img id="welcome-img" src={state.avatarUrl} />
          : <span id="welcome-initial">{this.displayInitial()}</span>
        }
      </button>
    </ToolTip>
  }
}

function UploadIcon (props) {
  return <ToolTip position="below" content="Upload file">
    <button data-active={props.active} id="welcome-upload" onClick={props.toggleUploadVisible}>{Icons.newFile}</button>
  </ToolTip>
}

function AboutCard (props) {
  return <div id="welcome-about-card">
    <div>Володимир Анатолійович Коваленко</div>
    <hr class="styled-rule" />
    <div id="welcome-about-card-icons">1975р. Луцьк. Грабовського 7а 11
    </div>
    <hr class="styled-rule" />
    <div>Телефон: +380964267234</div>
  </div>
}
