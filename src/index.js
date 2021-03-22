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
        this.state = {
            loggedIn : false
        }
        this.client = Matrix.createClient({
            baseUrl : "http://localhost:8008",
            userId : localStorage.getItem("userId"),
            accessToken : localStorage.getItem("accessToken"),
            timelineSupport : true,
        })
        window.addEventListener('login',this.loginHandler)
    }

    loginHandler = _ => { this.setState({loggedIn : true}) }

    render(props,state) {
        if (state.loggedIn) {
            return <WelcomeView client={this.client}/>
        } else {
            return <LoginView client={this.client}/>
        }
    }
}

render(<PopulusViewer/>, document.body)
