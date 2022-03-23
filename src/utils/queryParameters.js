import { h, Fragment} from 'preact'
import Client from '../client.js'
import Toast from '../toast.js'

// this handles query parameters that should be present at the application launch
export function handleLaunchParameters(logoutHandler) {
  const queryParameters = new URLSearchParams(window.location.search)
  const toJoin = queryParameters.get("join")
  const joinVia = queryParameters.getAll("via")
  const server = queryParameters.get('server')
  if (toJoin && joinVia.length > 0) Client.client.joinRoom(toJoin, { viaServers: joinVia })
  if (server && server !== Client.client.getDomain()) {
    Toast.set(<Fragment>
      <h3 id="toast-header">You might be in the wrong place</h3>
      <div>
        The link that brought you here requested
        <pre>{server}</pre>
        but you're already logged in to
        <pre>{Client.client.getDomain()}</pre>
        If you want join the server requested by the link you followed, log out
        and then follow the link again.
      </div>
      <div style="margin-top:10px">
        <button onclick={_ => {
          Toast.set(null)
          logoutHandler()
        }} class="styled-button">
          Log out
        </button>
      </div>
    </Fragment>)
  }
  window.history.replaceState({toastWarning: true}, '', window.location.pathname + window.location.hash)
}
