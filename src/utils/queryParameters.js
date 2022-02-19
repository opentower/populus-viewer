import Client from '../client.js'

// this handles query parameters that should be present at the application launch
export function handleLaunchParameters() {
  const queryParameters = new URLSearchParams(window.location.search)
  const toJoin = queryParameters.get("join")
  const joinVia = queryParameters.getAll("via")
  if (toJoin && joinVia.length > 0) Client.client.joinRoom(toJoin, { viaServers: joinVia })
  window.history.replaceState({}, '', window.location.pathname + window.location.hash)
}
