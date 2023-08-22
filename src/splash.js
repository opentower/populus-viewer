import { h, Component } from 'preact';
import { handleLaunchParameters } from './utils/queryParameters.js'
import './styles/splash.css'
import Client from './client.js'

export default class SplashView extends Component {
  pollInitialized = async () => {
    if (Client.client && ["PREPARED", "SYNCING", "ERROR"].includes(Client.client.getSyncState()) ) {
      // in case of error, we still let the user into the app, for offline usage
      this.props.setInitializationStage("initialized")
      handleLaunchParameters(this.props.logoutHandler) // clear query parameters
    } else {
      setTimeout(this.pollInitialized, 1000)
    }
  }

  componentDidMount() { this.pollInitialized() }

  render (props) {
    return <div id="splash-wrapper">
      <PopulusLogo />
      <div id="splash-loader">{props.initializationStage}</div>
    </div>
  }
}

function PopulusLogo () {
  return <svg width="31mm" height="31mm" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="42" height="42" fill="#FFFFFF"/>
  <rect x="2" y="2" width="38" height="38" fill="#7CFC00"/>
  <text x="50%" y="50%" font-family="Arial" font-size="8" font-weight="bold" fill="#FF0000" text-anchor="middle" dominant-baseline="middle">
    МедКарта
  </text>
</svg>
}
