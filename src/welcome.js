import { h, Fragment, Component } from 'preact';
import { UserColor } from './utils/colors.js'
import PdfUpload from './pdfUpload.js'
import RoomList from './roomList.js'
import Client from './client.js'
import SearchBar from './search.js'
import ProfileInformation from './profileInformation.js'
import NotificationListing from './notifications.js'
import * as Icons from './icons.js'
import Modal from './modal.js'
import Toast from './toast.js'
import SyncIndicator from './syncIndicator.js'
import './styles/welcome.css'

export default class WelcomeView extends Component {
  constructor(props) {
    super(props)
    const userId = Client.client.getUserId()
    this.user = Client.client.getUser(userId)
    this.userColor = new UserColor(userId)
    this.profileListener = this.profileListener.bind(this)
    this.state = {
      view: null,
      inputFocus: false,
      searchFilter: "",
      avatarUrl: Client.client.getHttpUriForMxcFromHS(this.user.avatarUrl, 30, 30, "crop")
    }
  }

  componentDidMount () {
    this.user.on("User.avatarUrl", this.profileListener)
  }

  componentWillUnmount () {
    this.user.off("User.avatarUrl", this.profileListener)
  }

  profileListener () {
    this.setState({
      avatarUrl: Client.client.getHttpUriForMxcFromHS(this.user.avatarUrl, 30, 30, "crop")
    })
  }

  setSearch = s => this.setState({ searchFilter: s})

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

  emptyModal = _ => this.setState({ modalContent: null })

  populateModal = s => this.setState({ modalContent: s })

  emptyToast = _ => this.setState({ toastContent: null })

  populateToast = s => this.setState({ toastContent: s })

  showMainView = _ => this.setState({ view: null })

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
            <SearchBar
              search={state.searchFilter}
              setSearch={this.setSearch}
              setFocus={this.setFocus} />
            { !state.inputFocus && <Fragment>
              <div data-welcome-active={state.view === "UPLOAD"} id="welcome-upload" onClick={this.toggleUploadVisible}>{Icons.newFile}</div>
              <WelcomeIcon welcomeActive={state.view === "NOTIF"} toggleNotifVisible={this.toggleNotifVisible} />
              <div data-welcome-active={state.view === "PROFILE"} id="welcome-profile" onClick={this.toggleProfileVisible} style={this.userColor.styleVariables} >
                {state.avatarUrl
                  ? <img id="welcome-img" src={state.avatarUrl} />
                  : <div id="welcome-initial">{this.displayInitial()}</div>
                }
              </div>
            </Fragment>}
          </div>
        </header>
        <div id="welcome-container">
          {state.view === "UPLOAD"
            ? <Fragment>
              <h2>Upload a new PDF</h2>
              <PdfUpload showMainView={this.showMainView} />
            </Fragment>
            : state.view === "PROFILE"
              ? <Fragment>
                <h2>Update Your Profile</h2>
                <ProfileInformation logoutHandler={props.logoutHandler} showMainView={this.showMainView} />
              </Fragment>
              : state.view === "NOTIF"
                ? <NotificationListing />
                : <Fragment>
                    <RoomList
                      searchFilter={state.searchFilter}
                      populateModal={this.populateModal}
                    />
                  </Fragment>
          }
        </div>
        <SyncIndicator />
      </Fragment>
    )
  }
}

class WelcomeIcon extends Component {
  constructor(props) {
    super(props)
    const unread = Client.client.getVisibleRooms()
      .reduce((acc, room) => acc + room.getUnreadNotificationCount("highlight"), 0)
    this.state = { unread }
    this.updateCounts = this.updateCounts.bind(this)
  }

  componentDidMount() {
    Client.client.on("sync", this.updateCounts)
  }

  componentWillUnmount() {
    Client.client.off("sync", this.updateCounts)
  }

  updateCounts() {
    const unread = Client.client.getVisibleRooms()
      .reduce((acc, room) => acc + room.getUnreadNotificationCount("highlight"), 0)
    this.setState({ unread })
  }

  render(props, state) {
    return <div data-welcome-active={props.welcomeActive} id="welcome-notifications" onClick={props.toggleNotifVisible}>
        {Icons.bell}
        {state.unread > 0 ? <span class="small-icon-badge">{state.unread}</span> : null}
    </div>
  }
}
