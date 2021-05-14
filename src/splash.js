import { h, Component } from 'preact';
import './styles/splash.css'
import QueryParameters from './queryParams.js'
import Client from './client.js'
import { domainName, lastViewed } from './constants.js'

export default class SplashView extends Component {
  pollInitialized = async () => {
    if (Client.client.isInitialSyncComplete()) {
      const maybeTitle = QueryParameters.get("title") || null
      let maybePage = Number(QueryParameters.get("page")) || null
      if (maybeTitle && !maybePage) {
        const theId = await Client.client.getRoomIdForAlias(`#${maybeTitle}:${domainName}`)
        const theRoom = Client.client.getRoom(theId.room_id)
        maybePage = theRoom.getAccountData(lastViewed).getContent().page || 1
      }
      this.props.pushHistory({
        pdfFocused: maybeTitle,
        pageFocused: maybePage
      })
      this.props.setInitialized()
    } else {
      console.log("polling initialization...")
      setTimeout(this.pollInitialized, 1000)
    }
  }

  componentDidMount() {
    setTimeout(this.pollInitialized, 3000)
  }

  render () {
    return <div id="splash-wrapper">
      <div id="splash-logo">Populus</div>
      <div id="splash-loader">loading...</div>
    </div>
  }
}
