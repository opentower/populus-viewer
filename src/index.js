import * as Matrix from "matrix-js-sdk"
import { h, render, Fragment, Component } from 'preact';
import WelcomeView from './welcome.js';
import LoginView from './login.js';
import PdfView from './pdfView.js';
import SplashView from './splash.js';
import './styles/global.css'
import { serverRoot } from './constants.js'

// This module is the entrypoint for the viewer. It'll be reponsible for the
// main container element, for initializing the client object, and for
// handling high-level global state and events. Other functionality should
// be delegated to other components that we import here.

class PopulusViewer extends Component {
    constructor () {
        super()
        this.queryParams = new URLSearchParams(window.location.search)
        this.client = Matrix.createClient({
            baseUrl : serverRoot,
            userId : localStorage.getItem("userId"),
            accessToken : localStorage.getItem("accessToken"),
            timelineSupport : true,
            unstableClientRelationAggregation: true,
        })
        this.state = { 
            loggedIn : false,
            initialized : false,
            pdfFocused : this.queryParams.get("title") || false,
            pageFocused : Number(this.queryParams.get("page")) || 1,
        }
        if (this.client.getUserId()) this.loginHandler()
        //initialize navigation history
        window.history.pushState({ 
            pdfFocused : this.state.pdfFocused,
            pageFocused : this.state.pageFocused,
        },"", "?" + this.queryParams.toString()) 
        //handle navigation events
        window.addEventListener('popstate', e => {
            this.setState({
                pdfFocused : e.state.pdfFocused || false,
                pageFocused : e.state.pageFocused || 1,
            })
        })
    }

    setInitialized = _ => this.setState({ initialized : true })

    logoutHandler = _ => { 
        localStorage.clear()
        this.client.stopClient()
        this.client = Matrix.createClient({
            baseUrl : serverRoot,
            timelineSupport : true,
        })
        this.setState({loggedIn : false})
    }

    loginHandler = _ => { 
        localStorage.setItem("accessToken", this.client.getAccessToken())
        localStorage.setItem("userId", this.client.getUserId())
        this.client.startClient({initialSyncLimit:1}).then(_ => {
            this.setState({loggedIn : true}) 
        })
    }

    pushHistory = newState => {
       if (newState.pdfFocused) this.queryParams.set("title", newState.pdfFocused)
       if (newState.pdfFocused === null) {
           this.queryParams.delete("title")
           this.queryParams.delete("focus")
       }
       if (newState.pageFocused) this.queryParams.set("page", newState.pageFocused)
       if (newState.pageFocused === null) this.queryParams.delete("page")
       this.setState(newState, _ => window.history.pushState({ 
               pdfFocused : this.state.pdfFocused,
               pageFocused : this.state.pageFocused,
           },"", "?" + this.queryParams.toString())
       )
    }

    render(props,state) {
        if (!state.loggedIn) {
            return <LoginView loginHandler={this.loginHandler} client={this.client}/>
        } 
        if (!state.initialized) {
            return <SplashView setInitialized={this.setInitialized} client={this.client}/>
        }
        if (state.pdfFocused) {
            return <PdfView queryParams={this.queryParams}
                            pushHistory={this.pushHistory} 
                            pageFocused={this.state.pageFocused} 
                            pdfFocused={this.state.pdfFocused} 
                            client={this.client}/>
        } else {
            return <WelcomeView pushHistory={this.pushHistory} 
                                queryParams={this.queryParams}
                                logoutHandler={this.logoutHandler} 
                                client={this.client}/>
        }
    }
}

export function recaptchaHandler (recaptchaToken) {
    window.dispatchEvent(new CustomEvent('recaptcha', { detail : recaptchaToken }))
}

render(<PopulusViewer/>, document.body)
