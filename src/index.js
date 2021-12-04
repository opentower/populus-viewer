import { h, render, Component } from 'preact'
import Router from 'preact-router'
import WelcomeView from './welcome.js'
import LoginView from './login.js'
import PdfView from './pdfView.js'
import SplashView from './splash.js'
import History from './history.js'
import Client from './client.js'
import './styles/global.css'

class PopulusViewer extends Component {
  constructor () {
    super()
    this.state = {
      initializationStage: "connecting to database",
      loggedIn: true
      // the presumption is that we're logged in until it's clear that we're
      // not. This avoids flashing the login view while verifying that we're
      // logged in.
    }
    const queryParameters = new URLSearchParams(window.location.search)
    this.loginToken = queryParameters.get('loginToken')

    if (Client.isResumable()) Client.initClient().then(this.loginHandler)
    else if (this.loginToken) {
      Client.initClient()
        .then(_ => Client.client.loginWithToken(this.loginToken, this.loginHandler))
        .then(_ => window.history.replaceState({}, '', location.pathname)) // clear query paramters
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

  render (_props, state) {
    if (!state.loggedIn) return <LoginView loginHandler={this.loginHandler} />
    if (!(state.initializationStage === "initialized")) {
      return <SplashView
        initializationStage={state.initializationStage}
        setInitializationStage={this.setInitializationStage}
      />
    }
    return <Router history={History.history}>
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
