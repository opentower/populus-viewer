import { h, Fragment, createRef, Component } from 'preact';
import './styles/login.css'
import { serverRoot } from './constants.js'
import Client from './client.js'

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
      return <div><RegistrationModal loginHandler={props.loginHandler} switchView={this.switchView} /></div>
    }
    return <div><LoginModal loginHandler={props.loginHandler} switchView={this.switchView} /></div>
  }
}

class LoginModal extends Component {
  handleSubmit = (e) => {
    e.preventDefault()
    const loginForm = document.getElementById("loginForm")
    const formdata = new FormData(loginForm)
    const entries = Array.from(formdata.entries()).map(i => i[1])
    if (entries[2]) localStorage.setItem("baseUrl", `https://${entries[2]}`)
    else localStorage.setItem("baseUrl", serverRoot)
    Client.initClient()
      .then(client => client.loginWithPassword(entries[0].toLowerCase(), entries[1]))
      .then(this.props.loginHandler)
      .catch(window.alert)
  }

  render(props) {
    return <div id="loginModal">
      <h3>Login To Populus</h3>
      <form id="loginForm">
        <UserData />
        <div>
          <button className="styled-button" onClick={this.handleSubmit} >Login</button>
        </div>
        <div>
          <span>Don't have a username? </span><button className="styled-button" onClick={props.switchView} >Register an Account</button>
        </div>
      </form>
    </div>
  }
}

class RegistrationModal extends Component {
  constructor (props) {
    super(props)
    this.state = {
      registrationStage: "awaiting-server"
    }
    this.recaptchaHandler = this.recaptchaHandler.bind(this)
    window.addEventListener('recaptcha', this.recaptchaHandler) // TODO: remove on unload of this component
  }

  registerForm = createRef()

  beginRegistrationFlow = async e => {
    e.preventDefault()
    this.setState({ registrationStage: "retrieving-auth" })
    const loginForm = this.registerForm.current
    const formdata = new FormData(loginForm)
    const entries = Array.from(formdata.entries()).map(i => i[1])
    if (/[^a-zA-Z0-9._=/]/.test(entries[0])) {
      alert("Usernames must consist of characters which are alphanumeric, or among '.' ,'/' ,'=' , and '_'.")
      this.props.switchView()
      return;
    }
    this.username = entries[0]
    if (entries[1].length < 8) {
      alert("passwords must be at least 8 characters long")
      this.props.switchView()
      return;
    }
    this.password = entries[1]
    if (entries[2].length < 1) this.server = serverRoot
    else this.server = entries[2]
    localStorage.setItem("baseUrl", this.server)
    await Client.initClient()
    await Client.client.register(this.username.toLowerCase(), this.password, undefined, {}).catch(
      e => {
        console.log(e.data)
        if (e.data.session && e.data.params["m.login.recaptcha"]) {
          this.authSession = e.data.session
          this.recaptchaKey = e.data.params["m.login.recaptcha"].public_key
        } else {
          alert("Error: can't start registration flow with this server")
          // need to also analyze for 404 and other failures here.
        }
      })
    this.setState({ registrationStage: "awaiting-recaptcha" })
  }

  recaptchaHandler = e => {
    e.preventDefault()
    this.setState({ registrationStage: "registering" })
    Client.client.register(this.username.toLowerCase(), this.password, this.authSession, {
      type: "m.login.recaptcha",
      response: e.detail
    }).then(_ => Client.client.loginWithPassword(this.username.toLowerCase(), this.password))
      .then(this.props.loginHandler)
      .catch(window.alert)
  }

  render(props, state) {
    switch (state.registrationStage) {
      case "retrieving-auth" : {
        return <div id="registrationModal">
          <div id="registeringFeedback">Retrieving Authentication Procedures...</div>
        </div>
      }
      case "registering" : {
        return <div id="registrationModal">
          <div id="registeringFeedback">Registering Account...</div>
        </div>
      }
      case "awaiting-recaptcha" : {
        return <div id="registrationModal">
          <form id="registerForm">
            <div id="theRecaptcha">
              Complete this Recaptcha to finish registration
              <div className="g-recaptcha"
                data-sitekey={this.recaptchaKey}
                data-callback="recaptchaHandler" /></div>
            <div>OR, <button className="styled-button" onClick={props.switchView} >Login With Existing Account</button></div>
            <script src="https://www.google.com/recaptcha/api.js" async defer />
          </form>
        </div>
      }
      case "awaiting-server" : {
        return <div id="registrationModal">
          <h3>Register an account</h3>
          <form ref={this.registerForm} id="registerForm">
            <UserData />
            <div><button className="styled-button" onClick={this.beginRegistrationFlow} >Register a New Account</button></div>
            <div>Already have an account? <button className="styled-button" onClick={props.switchView} >Login With Existing Account</button></div>
          </form>
        </div>
      }
    }
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
        <label htmlFor="servername">Server</label>
        <input type="text" id="servername" name="servername" placeholder="populus.open-tower.com" />
      </Fragment>
    )
  }
}
