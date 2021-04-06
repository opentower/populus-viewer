import { h, render, Fragment, Component } from 'preact';
import './styles/login.css'

export default class LoginView extends Component {
    constructor(props) {
        super(props)
        this.client = props.client
        this.state = { registering : false }
    }

    switchView = (e) => {
        e.preventDefault()
        this.setState(oldstate => {
            return {registering : !oldstate.registering}
        })
    }

    render(props,state) {
        if (state.registering) {
            return <div><RegistrationModal {...props} View={this.switchView}/></div>
        } else {
            return <div><LoginModal {...props} switchView={this.switchView}/></div>
        }
    }
}

class LoginModal extends Component {

    constructor (props) {
        super(props)
        this.loginHandler = props.loginHandler
        this.client = props.client
    }

    handleSubmit = (e) => {
        e.preventDefault()
        const loginForm = document.getElementById("loginForm")
        const formdata = new FormData(loginForm)
        const entries = Array.from(formdata.entries()).map(i => i[1])
        this.client
            .loginWithPassword(entries[0],entries[1])
            .then(_ => this.loginHandler())
            .catch(e => window.alert(e))
    }

    render(props,state) {
        return (
            <div>
            <div id="top"></div>
            <div id="right"></div>
            <div id="bottom"></div>
            <div id="left"></div>
            <div id='title'><a href="/">Populus</a></div>
            <div id="loginModal">
                <h3>Login To Populus</h3>
                <form id="loginForm">
                    <UserData/>
                    <div>
                        <button onclick={this.handleSubmit} >Login</button>
                        <button onclick={props.switchView} >Register</button>
                    </div>
                </form>
            </div>
            </div>
        )
    }
}

class RegistrationModal extends Component {

    constructor (props) {
        super(props)
        this.loginHandler = props.loginHandler
        this.client = props.client
        window.addEventListener('recaptcha', this.recaptchaHandler) //TODO: remove on unload of this component
    }

    recaptchaHandler = e => {
        e.preventDefault()
        const loginForm = document.getElementById("registerForm")
        const formdata = new FormData(loginForm)
        const entries = Array.from(formdata.entries()).map(i => i[1])
        this.client.register(entries[0], entries[1], undefined, {
            type : "m.login.recaptcha",
            response : e.detail
        }).then(_ => this.client.loginWithPassword(entries[0],entries[1]))
        .then(_ => this.loginHandler())
        .catch(e => window.alert(e))
    }

    render(props,state) {
        return (
            <div id="registrationModal">
                <h3>Register on Populus</h3>
                <form id="registerForm">
                    <UserData/>
                    <div id="theRecaptcha">
                        Complete this Recaptcha to register
                        <div class="g-recaptcha"
                            data-sitekey="6Lf43YEaAAAAAAeDHR1ozhTXVqq--Wthr_MQlYam"
                            data-callback="recaptchaHandler"></div></div>
                    <div>OR, <button onclick={props.switchView} >Login With Existing Account</button></div>
                    <script src="https://www.google.com/recaptcha/api.js" async defer></script>
                </form>
            </div>
        )
    }
}

class UserData extends Component {
    render () {
        return (
            <Fragment>
                <label for="username">Username</label>
                <input type="text" id="username" name="username"></input>
                <label for="password">Password</label>
                <input type="password" id="password" name="password"></input>
            </Fragment>
        )
    }
}
