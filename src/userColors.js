function generateColor (username) {
  if (UserColor[username]) return UserColor[username] // memoize
  let hash = 0
  if (username.length === 0) return hash
  for (let i = 0; i < username.length; i++) {
    const chr = username.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  UserColor[username] = hash % 360
  return UserColor[username]
}

export default class UserColor {
  constructor(username) {
    this.hue = generateColor(username)
    this.light = `hsl(${this.hue},100%, 80%)`
    this.solid = `hsl(${this.hue},100%, 50%)`
    this.dark = `hsl(${this.hue},100%, 20%)`
    this.ultralight = `hsl(${this.hue},100%, 95%)`
    this.styleVariables = {
      "--user_ultralight": this.ultralight,
      "--user_light": this.light,
      "--user_solid": this.solid,
      "--user_dark": this.dark
    }
  }
}
