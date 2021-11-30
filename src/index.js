import { h, render, Component } from 'preact'
import Router from 'preact-router'
import { createHashHistory } from 'history'
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
    this.state = { initializationStage: "connecting to database" }

    this.setLastPage = this.setLastPage.bind(this)
    this.loginToken = QueryParameters.get('loginToken')

    if (Client.isResumable()) Client.initClient().then(this.loginHandler)
    else if (this.loginToken) {
      Client.initClient()
        .then(_ => Client.client.loginWithToken(this.loginToken, this.loginHandler))
        .then(_ => QueryParameters.delete('loginToken'))
    } else this.setState({ loggedIn: false })
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

  history = createHashHistory()

  setLastPage = async _ => {
    if (!this.state.pdfFocused || !this.state.pageFocused) return
    const theId = await Client.client.getRoomIdForAlias(this.state.pdfFocused)
    await Client.client.setRoomAccountData(theId.room_id, lastViewed, { page: this.state.pageFocused, deviceId: Client.deviceId })
  }

  render (_props, state) {
    if (!(state.initializationStage === "initialized")) {
      return <SplashView
        initializationStage={state.initializationStage}
        setInitializationStage={this.setInitializationStage}
      />
    }
    if (!state.loggedIn) return <LoginView loginHandler={this.loginHandler} />
    return <Router history={this.history}>
      <WelcomeView path="/" logoutHandler={this.logoutHandler} />
      <PdfView path="/:pdfFocused/:pageFocused?/:roomFocused?" />
    </Router>
  }
}

function recaptchaHandler (recaptchaToken) {
  window.dispatchEvent(new CustomEvent('recaptcha', { detail: recaptchaToken }))
}

window.recaptchaHandler = recaptchaHandler // needs to be global for the google callback

render(<PopulusViewer />, document.body)
