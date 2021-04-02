import * as Matrix from "matrix-js-sdk"
import { h, render, Fragment, Component } from 'preact';
import WelcomeView from './welcome.js';
import LoginView from './login.js';
import PdfView from './pdfView.js';
import './styles/global.css'

// This module is the entrypoint for the viewer. It'll be reponsible for the
// main container element, for initializing the client object, and for
// handling high-level global state and events. Other functionality should
// be delegated to other components that we import here.

class PopulusViewer extends Component {
    constructor () {
        super()
        this.queryParams = new URLSearchParams(window.location.search)
        this.client = Matrix.createClient({
            baseUrl : "http://localhost:8008",
            userId : localStorage.getItem("userId"),
            accessToken : localStorage.getItem("accessToken"),
            timelineSupport : true,
        })
        this.state = { 
            loggedIn : false,
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
            console.log(this.state)
        })
    }

    logoutHandler = _ => { 
        localStorage.clear()
        this.client.stopClient()
        this.client = Matrix.createClient({
            baseUrl : "http://localhost:8008",
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

    loadPDF = (title) => {
       this.setState({pdfFocused : title})
       this.queryParams.set("title", title)
       window.history.pushState({ pdfFocused : title},"", "?" + this.queryParams.toString())
    }

    loadPage = (pageNo) => {
       this.setState({pageFocused : pageNo})
       this.queryParams.set("page", pageNo)
       window.history.pushState({ 
           pdfFocused : this.state.pdfFocused,
           pageFocused : pageNo,
       },"", "?" + this.queryParams.toString())
    }

    render(props,state) {
        if (!state.loggedIn) {
            return <LoginView loginHandler={this.loginHandler} client={this.client}/>
        } if (state.pdfFocused) {
            return <PdfView loadPage={this.loadPage} pageFocused={this.state.pageFocused} pdfFocused={this.state.pdfFocused} client={this.client}/>
        } else {
            return <WelcomeView loadPDF={this.loadPDF} logoutHandler={this.logoutHandler} client={this.client}/>
        }
    }
}

export function recaptchaHandler (recaptchaToken) {
    window.dispatchEvent(new CustomEvent('recaptcha', { detail : recaptchaToken }))
}

render(<PopulusViewer/>, document.body)
