import { h, Fragment, createRef, Component } from 'preact';
import './styles/login.css'

export default class LoginView extends Component {
  constructor(props) {
    super(props)
    this.state = { registering: false }
  }

  switchView = (e) => {
    if (e) e.preventDefault()
    this.setState(oldstate => {
      return {registering: !oldstate.registering}
    })
  }

  render(props, state) {
    if (state.registering) {
      return <div><RegistrationModal client={props.client} switchView={this.switchView} /></div>
    }
    return <div><LoginModal client={props.client} loginHandler={props.loginHandler} switchView={this.switchView} /></div>
  }
}

class LoginModal extends Component {
    handleSubmit = (e) => {
      e.preventDefault()
      const loginForm = document.getElementById("loginForm")
      const formdata = new FormData(loginForm)
      const entries = Array.from(formdata.entries()).map(i => i[1])
      this.props.client
        .loginWithPassword(entries[0].toLowerCase(), entries[1])
        .then(_ => this.props.loginHandler())
        .catch(e => window.alert(e))
    }

    render(props, _) {
      return (
        <div id="loginModal">
          <h3>Login To Populus</h3>
          <form id="loginForm">
            <UserData />
            <div>
              <button className="styled-button" onClick={this.handleSubmit} >Login</button>
              <button className="styled-button" onClick={props.switchView} >Register</button>
            </div>
          </form>
        </div>
      )
    }
}

class RegistrationModal extends Component {
  constructor (props) {
    super(props)
    this.loginHandler = props.loginHandler
    window.addEventListener('recaptcha', this.recaptchaHandler) // TODO: remove on unload of this component
  }

  recaptchaHandler = e => {
    e.preventDefault()
    const loginForm = document.getElementById("registerForm")
    const formdata = new FormData(loginForm)
    const entries = Array.from(formdata.entries()).map(i => i[1])
    if (/[^a-zA-Z0-9._=/]/.test(entries[0])) {
      alert("Usernames must consist of characters which are alphanumeric, or among '.' ,'/' ,'=' , and '_'.")
      this.props.switchView()
      return;
    }
    if (entries[1].length < 8) {
      alert("passwords must be at least 8 characters long")
      this.props.switchView()
      return;
    }
    this.props.client.register(entries[0].toLowerCase(), entries[1], undefined, {
      type: "m.login.recaptcha",
      response: e.detail
    }).then(_ => this.props.client.loginWithPassword(entries[0].toLowerCase(), entries[1]))
      .then(_ => this.loginHandler())
      .catch(e => window.alert(e))
  }

  render(props, _) {
    return (
      <div id="registrationModal">
        <h3>Register on Populus</h3>
        <form id="registerForm">
          <UserData />
          <div id="theRecaptcha">
            Complete this Recaptcha to register
            <div className="g-recaptcha"
              data-sitekey="6Lf43YEaAAAAAAeDHR1ozhTXVqq--Wthr_MQlYam"
              data-callback="recaptchaHandler" /></div>
          <div>OR, <button className="styled-button" onClick={props.switchView} >Login With Existing Account</button></div>
          <script src="https://www.google.com/recaptcha/api.js" async defer />
        </form>
      </div>
    )
  }
}

class UserData extends Component {
  usernameInput = createRef()

  validateUsername = (e) => {
    if (/[^a-zA-Z0-9._=/]/.test(e.target.value)) this.usernameInput.current.setCustomValidity("Bad Character")
    else this.usernameInput.current.setCustomValidity("")
  }

  render () {
    return (
      <Fragment>
        <label htmlFor="username">Username</label>
        <input type="text" ref={this.usernameInput} id="username" onInput={this.validate} name="username" />
        <label htmlFor="password">Password</label>
        <input type="password" id="password" name="password" />
      </Fragment>
    )
  }
}
