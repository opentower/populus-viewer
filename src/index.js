import * as Matrix from "matrix-js-sdk"
import { h, render, Fragment, Component } from 'preact';
import WelcomeView from './welcome.js';
import LoginView from './login.js';

// This module is the entrypoint for the viewer. It'll be reponsible for the
// main container element, for initializing the client object, and potentially
// for initializing a primary event emitter. Other functionality should be
// delegated to other compoents that we import here.

class PopulusViewer extends Component {
    constructor () {
        super()
        this.client = Matrix.createClient({
            baseUrl : "http://localhost:8008",
            userId : localStorage.getItem("userId"),
            accessToken : localStorage.getItem("accessToken"),
            timelineSupport : true,
        })
        this.state = {
            loggedIn : this.client.getUserId() ? true : false
        }
        window.addEventListener('login', this.loginHandler)
        window.addEventListener('logout', this.logoutHandler)
    }

    logoutHandler = _ => { 
        localStorage.clear()
        this.client.logout()
        this.client = Matrix.createClient({
            baseUrl : "http://localhost:8008",
            timelineSupport : true,
        })
        this.setState({loggedIn : false}) 
    }

    loginHandler = _ => { 
        localStorage.setItem("accessToken", this.client.getAccessToken())
        localStorage.setItem("userId", this.client.getUserId())
        this.setState({loggedIn : true}) 
    }

    render(props,state) {
        if (state.loggedIn) {
            return <WelcomeView client={this.client}/>
        } else {
            return <LoginView client={this.client}/>
        }
    }
}

export function recaptchaHandler (recaptchaToken) {
    window.dispatchEvent(new CustomEvent('recaptcha', { detail : recaptchaToken }))
}

render(<PopulusViewer/>, document.body)
