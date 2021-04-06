
export default function UserColor (username) { 
  if (UserColor[username]) return UserColor[username] //memoize
  var hash = 0, i, chr;
  if (username.length === 0) return hash;
  for (i = 0; i < username.length; i++) {
    chr   = username.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  UserColor[username] = hash % 360
  return UserColor[username] 
}
