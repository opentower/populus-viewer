import { h, Fragment, createRef, Component } from 'preact';
import './styles/login.css'
import { serverRoot } from './constants.js'
import Client from './client.js'
import * as Matrix from 'matrix-js-sdk'
import * as Icons from './icons.js'

export default class LoginView extends Component {
  constructor(props) {
    super(props)
    const queryParameters = new URLSearchParams(window.location.search)
    this.state = {
      registering: queryParameters.get("sso") ? "SSO" : false,
      name: "",
      password: "",
      server: queryParameters.get('server') || ""
    }
  }

  switchView = switchTo => (e) => {
    if (e) e.preventDefault()
    this.setState({registering: switchTo})
  }

  setServer = server => this.setState({ server })

  setName = name => this.setState({ name })

  setPassword = password => this.setState({ password})

  render(props, state) {
    const theProps = {
      setServer: this.setServer,
      server: state.server,
      setName: this.setName,
      name: state.name,
      setPassword: this.setPassword,
      password: state.password,
      loginHandler: props.loginHandler,
      switchView: this.switchView
    }
    switch (state.registering) {
      case "register": return <div><Registration {...theProps} /></div>
      case "SSO": return <div><SSO {...theProps} /></div>
    }
    return <div><Login {...theProps} /></div>
  }
}

class Login extends Component {
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

  handleSSO = e => e.preventDefault()

  render(props) {
    return <div id="login">
      <h3>Login To Populus</h3>
      <form id="loginForm">
        <UserData
          setServer={props.setServer}
          server={props.server}
          setPassword={props.setPassword}
          password={props.password}
          setName={props.setName}
          name={props.name} />
        <div>
          <button className="styled-button" onClick={this.handleSubmit} >Login</button>
        </div>
        <div>
          <span>Don't have a username? </span>
          <button className="styled-button" onClick={props.switchView("register")} >Register</button>
          <span>or&nbsp; </span>
          <button className="styled-button" onClick={props.switchView("SSO")} >Login Via SSO</button>
        </div>
      </form>
    </div>
  }
}

class SSO extends Component {
  constructor(props) {
    super(props)
    const queryParameters = new URLSearchParams(window.location.search)
    this.state = {
      SSOProviders: [],
      loading: false
    }
    if (this.props.server && queryParameters.get("sso")) this.trySSO(queryParameters.get("sso"), queryParameters.get("server"))
  }

  handleSubmit = (e) => {
    e.preventDefault()
    const loginForm = document.getElementById("loginForm")
    const formdata = new FormData(loginForm)
    const entries = Array.from(formdata.entries()).map(i => i[1])
    if (entries[0]) localStorage.setItem("baseUrl", `https://${entries[0]}`)
    else localStorage.setItem("baseUrl", serverRoot)
    this.setState({
      SSOProviders: [],
      loading: true
    })
    Client.initClient()
      .then(client => client.loginFlows())
      .then(this.handleFlows)
      .catch(_ => {
        window.alert("Couldn't connect. Check your server name - it should look like 'matrix.org'")
        this.setState({ loading: false })
      })
      // TODO: a nicer display for this error
  }

  handleFlows = flows => {
    const theSSO = flows.flows.find(flow => flow.type === "m.login.sso")
    if (!theSSO) {
      window.alert("This server doesn't appear to support SSO login.")
      this.setState({ loading: false })
      return
    }
    this.setState({
      loading: false,
      SSOProviders: theSSO.identity_providers
    })
  }

  trySSO = (idpId, server, e) => {
    e?.preventDefault()
    if (server) localStorage.setItem("baseUrl", `https://${server}`)
    Client.client
      ? window.location.replace(Client.client.getSsoLoginUrl(window.location.href, "sso", idpId))
      : Client.initClient().then(client => {
        window.location.replace(client.getSsoLoginUrl(window.location.href, "sso", idpId))
      })
  }

  handleServerInput = e => this.props.setServer(e.target.value)

  render(props, state) {
    return <div id="login">
      <h3>Sign In To Populus</h3>
      <form id="loginForm">
        <div>
          <label htmlFor="servername">Server</label>
          <input id="servername"
            value={props.server}
            oninput={this.handleServerInput}
            type="text"
            name="servername"
            placeholder="populus.open-tower.com" />
          <button className="styled-button" onClick={this.handleSubmit} >Look up SSO</button>
        </div>
        {state.loading ? <div id="server-loading-message">Loading...</div> : null}
        {state.SSOProviders.map(
          provider => {
            let iconHttpURI = null
            if (provider.icon) iconHttpURI = Matrix.getHttpUriForMxc(localStorage.getItem("baseUrl"), provider.icon, 40, 40, "crop")
            return <div onclick={e => this.trySSO(provider.id, null, e)} class="login-sso-listing"key={provider.id}>
              { iconHttpURI
                ? <img class="sso-icon" width="40" height="40" src={iconHttpURI} />
                : Icons.login
              }
              <a class="sso-name" href={`?server=${encodeURIComponent(props.server)}&sso=${encodeURIComponent(provider.id)}`}>
                {provider.name}
              </a>
            </div>
          }
        )}
        <div>
          <span>Don't want to use a third-party login? </span>
          <button className="styled-button" onClick={props.switchView("register")} >Register an Account</button>
        </div>
      </form>
    </div>
  }
}

class Registration extends Component {
  constructor (props) {
    super(props)
    this.state = {
      registrationStage: "awaiting-server"
    }
    this.recaptchaHandler = this.recaptchaHandler.bind(this)
  }

  componentDidMount() { window.addEventListener('recaptcha', this.recaptchaHandler) }

  componentWillUnmount() { window.removeEventListener('recaptcha', this.recaptchaHandler) }

  registerForm = createRef()

  beginRegistrationFlow = async e => {
    e.preventDefault()
    this.setState({ registrationStage: "retrieving-auth" })
    const loginForm = this.registerForm.current
    const formdata = new FormData(loginForm)
    const entries = Array.from(formdata.entries()).map(i => i[1])
    if (/[^a-zA-Z0-9._=/]/.test(entries[0])) {
      alert("Usernames must consist of characters which are alphanumeric, or among '.' ,'/' ,'=' , and '_'.")
      this.props.switchView("login")()
      return;
    }
    this.username = entries[0]
    if (entries[1].length < 8) {
      alert("passwords must be at least 8 characters long")
      this.props.switchView("login")()
      return;
    }
    this.password = entries[1]
    if (entries[2]) this.server = `https://${entries[2]}`
    else this.server = serverRoot
    localStorage.setItem("baseUrl", this.server)
    await Client.initClient()
    try {
      await Client.client.register(this.username.toLowerCase(), this.password, undefined, {})
    } catch (err) {
      if (err.data?.session && err.data.params["m.login.recaptcha"]) {
        this.authSession = err.data.session
        this.recaptchaKey = err.data.params["m.login.recaptcha"].public_key
        this.setState({ registrationStage: "awaiting-recaptcha" })
      } else {
        switch (err.name) {
          // should analyze for other errors here.
          case "ConnectionError" : {
            alert(`Can't connect to a server at\n\n${this.server}\n\n Double-check that address?`)
            break
          }
          default : alert("Error: can't start recaptcha registration flow with this server")
        }
        this.setState({ registrationStage: "awaiting-server" })
      }
    }
  }

  recaptchaHandler = e => {
    e.preventDefault()
    this.setState({ registrationStage: "registering" })
    Client.client.register(this.username.toLowerCase(), this.password, this.authSession, {
      type: "m.login.recaptcha",
      response: e.detail
    }).catch(this.handleDummy)
      .then(_ => Client.client.loginWithPassword(this.username.toLowerCase(), this.password))
      .then(this.props.loginHandler)
      .catch(window.alert)
  }

  handleDummy = err => {
    console.log(err.data)
    const dummyAvailable = data => {
      if (data.flows && data.completed) {
        return data.flows.some(flow => {
          const remaining = flow.stages.filter(x => !data.completed.includes(x))
          return remaining.length === 1 && remaining.includes("m.login.dummy")
        })
      }
      return false
    }
    if (dummyAvailable(err.data)) {
      return Client.client.register(this.username.toLowerCase(), this.password, this.authSession, {
        type: "m.login.dummy"
      })
    }
    throw new Error("Error: can't complete this registration flow")
  }

  render(props, state) {
    switch (state.registrationStage) {
      case "retrieving-auth" : {
        return <div id="registration">
          <div id="registeringFeedback">Retrieving Authentication Procedures...</div>
        </div>
      }
      case "registering" : {
        return <div id="registration">
          <div id="registeringFeedback">Registering Account...</div>
        </div>
      }
      case "awaiting-recaptcha" : {
        return <div id="registration">
          <form id="registerForm">
            <div id="theRecaptcha">
              Complete this Recaptcha to finish registration
              <div className="g-recaptcha"
                data-sitekey={this.recaptchaKey}
                data-callback="recaptchaHandler" />
            </div>
            <div>OR, <button className="styled-button" onClick={props.switchView("login")} >Login With Existing Account</button></div>
            <script src="https://www.google.com/recaptcha/api.js" async defer />
          </form>
        </div>
      }
      case "awaiting-server" : {
        return <div id="registration">
          <h3>Register an account</h3>
          <form ref={this.registerForm} id="registerForm">
            <UserData
              setServer={props.setServer}
              server={props.server}
              setPassword={props.setPassword}
              password={props.password}
              setName={props.setName}
              name={props.name} />
            <div><button className="styled-button" onClick={this.beginRegistrationFlow} >Register a New Account</button></div>
            <div>Already have an account? <button className="styled-button" onClick={props.switchView("login")} >Login With Existing Account</button></div>
          </form>
        </div>
      }
    }
  }
}

class UserData extends Component {
  usernameInput = createRef()

  passwordInput = createRef()

  validateUsername = (e) => {
    this.props.setName(e.target.value)
    if (/[^a-zA-Z0-9._=/]/.test(e.target.value)) this.usernameInput.current.setCustomValidity("Bad Character")
    else this.usernameInput.current.setCustomValidity("")
  }

  validatePassword = (e) => {
    this.props.setPassword(e.target.value)
    if (e.target.value.length < 8 && e.target.value.length > 0) this.passwordInput.current.setCustomValidity("Bad Password")
    else this.passwordInput.current.setCustomValidity("")
  }

  handleServerInput = e => this.props.setServer(e.target.value)

  render (props) {
    return (
      <Fragment>
        <label htmlFor="username">Username</label>
        <input value={props.name} onInput={this.validateUsername} type="text" ref={this.usernameInput} id="username" name="username" />
        <label htmlFor="password">Password</label>
        <input value={props.password} oninput={this.validatePassword} type="password" ref={this.passwordInput} id="password" name="password" />
        <label htmlFor="servername">Server</label>
        <input value={props.server} oninput={this.handleServerInput} type="text" id="servername" name="servername" placeholder="populus.open-tower.com" />
      </Fragment>
    )
  }
}
