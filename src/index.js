import { h, render, Component } from 'preact'
import WelcomeView from './welcome.js'
import LoginView from './login.js'
import PdfView from './pdfView.js'
import SplashView from './splash.js'
import QueryParameters from './queryParams.js'
import Client from './client.js'
import './styles/global.css'
import { domainName, lastViewed } from './constants.js'

// This module is the entrypoint for the viewer. It'll be reponsible for the
// main container element, for initializing the client object, and for
// handling high-level global state and events. Other functionality should
// be delegated to other components that we import here.

class PopulusViewer extends Component {
  constructor () {
    super()
    this.state = {
      loggedIn: false,
      initialized: false
    }
    Client.initClient().then(_ => {
      if (Client.client.getUserId()) this.loginHandler()
    })
    // handle navigation events - should probably be in onmount
    window.addEventListener('popstate', e => {
      this.setState({
        pdfFocused: e.state.pdfFocused || false,
        pageFocused: e.state.pageFocused || 1
      })
    })
    this.setLastPage = this.setLastPage.bind(this)
  }

  setInitialized = _ => this.setState({ initialized: true })

  logoutHandler = _ => {
    localStorage.clear()
    Client.restart()
    this.setState({ loggedIn: false })
  }

  loginHandler = _ => {
    localStorage.setItem('accessToken', Client.client.getAccessToken())
    localStorage.setItem('userId', Client.client.getUserId())
    Client.client.startClient().then(_ => {
      this.setState({ loggedIn: true })
    })
  }

  setLastPage = async _ => {
    if (!this.state.pdfFocused || !this.state.pageFocused) return
    const theId = await Client.client.getRoomIdForAlias(`#${this.state.pdfFocused}:${domainName}`)
    await Client.client.setRoomAccountData(theId.room_id, lastViewed, { page: this.state.pageFocused })
  }

  pushHistory = (newState, callback) => {
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
    }
    )
  }

  render (props, state) {
    if (!state.loggedIn) {
      return <LoginView loginHandler={this.loginHandler} />
    }
    if (!state.initialized) {
      return <SplashView setInitialized={this.setInitialized}
        pushHistory={this.pushHistory} />
    }
    if (state.pdfFocused) {
      return <PdfView pushHistory={this.pushHistory}
        pageFocused={this.state.pageFocused}
        pdfFocused={this.state.pdfFocused} />
    }
    return <WelcomeView pushHistory={this.pushHistory}
      logoutHandler={this.logoutHandler} />
  }
}

export function recaptchaHandler (recaptchaToken) {
  window.dispatchEvent(new CustomEvent('recaptcha', { detail: recaptchaToken }))
}

render(<PopulusViewer />, document.body)
