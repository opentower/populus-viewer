import * as Matrix from 'matrix-js-sdk'
import { h, render, Component } from 'preact'
import WelcomeView from './welcome.js'
import LoginView from './login.js'
import PdfView from './pdfView.js'
import SplashView from './splash.js'
import QueryParameters from './queryParams.js'
import './styles/global.css'
import { serverRoot, domainName, lastViewed } from './constants.js'

// This module is the entrypoint for the viewer. It'll be reponsible for the
// main container element, for initializing the client object, and for
// handling high-level global state and events. Other functionality should
// be delegated to other components that we import here.

class PopulusViewer extends Component {
  constructor () {
    super()
    // Probably both client and params should be globals rather than props, since
    // they're incidental to rendering
    this.client = Matrix.createClient({
      baseUrl: serverRoot,
      userId: localStorage.getItem('userId'),
      accessToken: localStorage.getItem('accessToken'),
      timelineSupport: true,
      unstableClientRelationAggregation: true
    })
    this.state = {
      loggedIn: false,
      initialized: false
    }
    if (this.client.getUserId()) this.loginHandler()
    // handle navigation events
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
    this.client.stopClient()
    this.client = Matrix.createClient({
      baseUrl: serverRoot,
      timelineSupport: true
    })
    this.setState({ loggedIn: false })
  }

  loginHandler = _ => {
    localStorage.setItem('accessToken', this.client.getAccessToken())
    localStorage.setItem('userId', this.client.getUserId())
    this.client.startClient({ initialSyncLimit: 1 }).then(_ => {
      this.setState({ loggedIn: true })
    })
  }

  setLastPage = async _ => {
    if (!this.state.pdfFocused || !this.state.pageFocused) return
    const theId = await this.client.getRoomIdForAlias(`#${this.state.pdfFocused}:${domainName}`)
    await this.client.setRoomAccountData(theId.room_id, lastViewed, { page: this.state.pageFocused })
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
      return <LoginView loginHandler={this.loginHandler} client={this.client} />
    }
    if (!state.initialized) {
      return <SplashView setInitialized={this.setInitialized}
        pushHistory={this.pushHistory}
        client={this.client} />
    }
    if (state.pdfFocused) {
      return <PdfView pushHistory={this.pushHistory}
        pageFocused={this.state.pageFocused}
        pdfFocused={this.state.pdfFocused}
        client={this.client} />
    }
    return <WelcomeView pushHistory={this.pushHistory}
      logoutHandler={this.logoutHandler}
      client={this.client} />
  }
}

export function recaptchaHandler (recaptchaToken) {
  window.dispatchEvent(new CustomEvent('recaptcha', { detail: recaptchaToken }))
}

render(<PopulusViewer />, document.body)
