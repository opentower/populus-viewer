import { h, Component } from 'preact';
import './styles/splash.css'
import { domainName, lastViewed } from './constants.js'

export default class SplashView extends Component {
  pollInitialized = async () => {
    if (this.props.client.isInitialSyncComplete()) {
      const maybeTitle = this.props.queryParams.get("title") || null
      let maybePage = Number(this.props.queryParams.get("page")) || null
      if (maybeTitle && !maybePage) {
        const theId = await this.props.client.getRoomIdForAlias(`#${maybeTitle}:${domainName}`)
        const theRoom = this.props.client.getRoom(theId.room_id)
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
