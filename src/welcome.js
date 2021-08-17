import { h, Fragment, Component } from 'preact';
import UserColor from './userColors.js'
import PdfUpload from './pdfUpload.js'
import RoomList from './roomList.js'
import Client from './client.js'
import SearchBar from './search.js'
import ProfileInformation from './profileInformation.js'
import * as Icons from './icons.js'
import Modal from './modal.js'
import Toast from './toast.js'
import './styles/welcome.css'

export default class WelcomeView extends Component {
  constructor(props) {
    super(props)
    const userId = Client.client.getUserId()
    this.user = Client.client.getUser(userId)
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
    uploadVisible: false,
    profileVisible: false
  })

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
                <RoomList
                  searchFilter={state.searchFilter}
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
