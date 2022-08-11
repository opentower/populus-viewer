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
  return <svg id="splash-logo" width="31mm" height="31mm" version="1.1" viewBox="-10 -10 45 45" xmlns="http://www.w3.org/2000/svg">
   <g transform="translate(-15.196 -28.116)">
    <circle id="splash-logo-back" cx="30.696" cy="43.616" r="15" style="paint-order:stroke fill markers"/>
    <circle cx="30.696" cy="43.616" r="15" fill="#fff" stroke-linejoin="round" style="paint-order:stroke fill markers"/>
    <g stroke-width=".38504" aria-label="P">
     <path d="m27.477 32.835h4.066q1.9714 0 3.3883 0.70847t2.187 2.0638q0.77008 1.3245 0.77008 3.1727 0 1.4169-0.55445 2.5566-0.55445 1.1089-1.4785 1.879t-2.0946 1.1705q-1.1705 0.36964-2.4334 0.27723-1.2321-0.09241-2.4026-0.70847v-0.30803t0.52365 0.09241q0.52365 0.06161 1.3245 0.0308 0.83168-0.06161 1.725-0.33883 0.92409-0.30803 1.6942-1.0473 0.80088-0.73927 1.2013-2.0638 0.09241-0.33883 0.15402-0.83168 0.06161-0.52365 0.0308-1.0165-0.0308-2.1254-1.1089-3.4191-1.0781-1.2937-3.0495-1.2937h-3.6348t-0.09241-0.21562q-0.06161-0.24642-0.15402-0.46204-0.06161-0.24642-0.06161-0.24642zm0.40044 0v21.562h-2.0022v-21.562zm-1.9098 19.313v2.2486h-2.4642v-0.30803t0.18482 0q0.21562 0 0.21562 0 0.80088 0 1.3553-0.55445 0.58526-0.58526 0.61606-1.3861zm0-17.065h-0.09241q0-0.80088-0.58526-1.3553-0.58526-0.58526-1.3861-0.58526 0 0-0.18482 0t-0.18482 0l-0.0308-0.30803h2.4642zm1.8174 17.065h0.09241q0.0308 0.80088 0.58526 1.3861 0.58526 0.55445 1.3861 0.55445 0 0 0.18482 0 0.21562 0 0.21562 0v0.30803h-2.4642z"/>
    </g>
   </g>
  </svg>
}
