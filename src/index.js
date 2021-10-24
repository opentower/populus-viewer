import { h, render, Component } from 'preact'
import WelcomeView from './welcome.js'
import LoginView from './login.js'
import PdfView from './pdfView.js'
import SplashView from './splash.js'
import QueryParameters from './queryParams.js'
import Client from './client.js'
import './styles/global.css'
import { lastViewed } from './constants.js'

class PopulusViewer extends Component {
  constructor () {
    super()
    this.state = {
      initializationStage: "connecting to database",
      pageFocused: null,
      pdfFocused: null
    }

    this.setLastPage = this.setLastPage.bind(this)
    this.loginToken = QueryParameters.get('loginToken')

    if (Client.isResumable()) Client.initClient().then(this.loginHandler)
    else if (this.loginToken) {
      Client.initClient()
        .then(_ => Client.client.loginWithToken(this.loginToken, this.loginHandler))
        .then(_ => QueryParameters.delete('loginToken'))
    } else this.setState({ loggedIn: false })
  }

  componentDidMount() {
    window.addEventListener('popstate', e => {
      this.setState({
        pdfFocused: e.state?.pdfFocused || false,
        pageFocused: e.state?.pageFocused || 1
      })
      QueryParameters.refresh()
    })
  }

  setInitializationStage = s => this.setState({ initializationStage: s })

  logoutHandler = _ => {
    localStorage.clear()
    Client.restart()
    this.setState({ loggedIn: false })
  }

  loginHandler = _ => {
    Client.client.on("Session.logged_out", this.logoutHandler)
    localStorage.setItem('accessToken', Client.client.getAccessToken())
    localStorage.setItem('userId', Client.client.getUserId())
    Client.client.startClient().then(_ => {
      this.setState({
        initializationStage: "performing initial sync",
        loggedIn: true
      })
    })
  }

  setLastPage = async _ => {
    if (!this.state.pdfFocused || !this.state.pageFocused) return
    const theId = await Client.client.getRoomIdForAlias(this.state.pdfFocused)
    await Client.client.setRoomAccountData(theId.room_id, lastViewed, { page: this.state.pageFocused, deviceId: Client.deviceId })
  }

  pushHistory = (newState, callback, message) => {
    this.message = message
    if (newState.pdfFocused) QueryParameters.set('title', newState.pdfFocused)
    if (newState.pdfFocused === null) {
      QueryParameters.delete('title')
      QueryParameters.delete('focus')
    }
    if (newState.pageFocused) QueryParameters.set('page', newState.pageFocused)
    if (newState.pageFocused === null) QueryParameters.delete('page')
    this.setState(newState, _ => {
      QueryParameters.pushHistory({
        pdfFocused: this.state.pdfFocused,
        pageFocused: this.state.pageFocused
      })
      clearTimeout(this.setLastPageTimeout)
      this.setLastPageTimeout = setTimeout(this.setLastPage, 1000)
      if (callback) callback()
    })
  }

  render (_props, state) {
    if (state.loggedIn === false) {
      return <LoginView loginHandler={this.loginHandler} />
    }
    if (!(state.initializationStage === "initialized")) {
      return <SplashView
        initializationStage={state.initializationStage}
        setInitializationStage={this.setInitializationStage}
        pushHistory={this.pushHistory}
        message={this.message}
      />
    }
    if (state.pdfFocused) {
      return <PdfView
        pushHistory={this.pushHistory}
        pageFocused={this.state.pageFocused}
        pdfFocused={this.state.pdfFocused}
        message={this.message}
      />
    }
    return <WelcomeView pushHistory={this.pushHistory}
      logoutHandler={this.logoutHandler} />
  }
}

function recaptchaHandler (recaptchaToken) {
  window.dispatchEvent(new CustomEvent('recaptcha', { detail: recaptchaToken }))
}

window.recaptchaHandler = recaptchaHandler // needs to be global for the google callback

render(<PopulusViewer />, document.body)
