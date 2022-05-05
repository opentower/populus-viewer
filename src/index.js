import { h, render, Fragment, Component } from 'preact'
import Router from 'preact-router'
import WelcomeView from './welcome.js'
import LoginView from './login.js'
import ContentView from './contentView.js'
import SplashView from './splash.js'
import Modal from "./modal.js"
import Toast from "./toast.js"
import History from './history.js'
import Client from './client.js'
import './assets.js'
import './styles/global.css'
import './styles/colors.css'

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
    if (localStorage.getItem('scrollbars')) document.documentElement.dataset.scrollbars = localStorage.getItem('scrollbars')
    else document.documentElement.dataset.scrollbars = "hidden"
    if (Client.isResumable()) Client.initClient().then(this.loginHandler)
    else if (this.loginToken) {
      Client.initClient().then(_ => Client.client.loginWithToken(this.loginToken, this.loginHandler))
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
      return <Fragment>
          <Toast />
          <SplashView
            initializationStage={state.initializationStage}
            setInitializationStage={this.setInitializationStage}
            logoutHandler={this.logoutHandler} />
      </Fragment>
    }
    return <Fragment>
        <Modal />
        <Toast />
        <Router history={History.history}>
          <WelcomeView path="/" logoutHandler={this.logoutHandler} />
          <ContentView path="/:resourceAlias/:resourcePosition?/:roomFocused?" />
        </Router>
    </Fragment>
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then(_ => {
      console.log('[Service Worker] registered');
    }).catch(registrationError => {
      console.log('[Service Worker] failed to register: ', registrationError);
    });
  });
}

function recaptchaHandler (recaptchaToken) {
  window.dispatchEvent(new CustomEvent('recaptcha', { detail: recaptchaToken }))
}

window.recaptchaHandler = recaptchaHandler // needs to be global for the google callback

render(<PopulusViewer />, document.body)
