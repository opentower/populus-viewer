import { h, Fragment } from 'preact'
import Client from '../client.js'
import Toast from '../toast.js'

export function toastError (headline) {
  return e => {
    Toast.set(<Fragment>
      <h3 id="toast-header">{headline}</h3>
      <div>Here's the error message:</div>
      <pre>{e.message}</pre>
    </Fragment>)
  }
}

export function onlineOrAlert() {
  if (Client.client.getSyncState() === "ERROR") {
    Toast.set(<Fragment>
      <h3 id="toast-header">It looks like you're offline</h3>
      <div>
        This operation requires a network connection. Try again once you're back online.
      </div>
    </Fragment>)
    return false
  }
  return true
}
