import { h, Component } from 'preact';
import Client from './client.js'
import "./styles/syncIndicator.css"

export default class SyncIndicator extends Component {
  constructor(prop) {
    super(prop)
    this.state = {
      syncStatus: this.fromState(Client.client.getSyncState())
    }
    this.handleSync = this.handleSync.bind(this)
  }

  fromState(syncState) {
    // TODO Icons?
    switch (syncState) {
      case "PREPARED": return "loading data...";
      case "CATCHUP": return "loading data...";
      case "ERROR": return "no connection - working offline";
      default: return null;
    }
  }

  componentDidMount() {
    Client.client.on("sync", this.handleSync)
  }

  componentWillUnmount() {
    Client.client.off("sync", this.handleSync)
  }

  handleSync(syncState, prevSyncState) {
    if (prevSyncState === "PREPARED") Client.client.emit("sync.initial")
    this.setState({syncStatus: this.fromState(syncState)})
  }

  render(props, state) {
    return state.syncStatus
      ? <div class={props.class} id="sync-indicator">{state.syncStatus}</div>
      : null
  }
}
