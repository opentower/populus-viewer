import { hashString } from './math.js'

function generateColor (username) {
  if (UserColor[username]) return UserColor[username] // memoize
  const hash = hashString(username)
  UserColor[username] = hash % 360
  return UserColor[username]
}

export class UserColor {
  constructor(userId) {
    this.hue = generateColor(userId)
    this.light = `hsl(${this.hue},100%, 80%)`
    this.solid = `hsl(${this.hue},100%, 50%)`
    this.dark = `hsl(${this.hue},100%, 20%)`
    this.ultralight = `hsl(${this.hue},100%, 95%)`
    this.ultradark = `hsl(${this.hue},100%, 10%)`
    this.styleVariables = {
      "--user_ultralight": this.ultralight,
      "--user_light": this.light,
      "--user_solid": this.solid,
      "--user_dark": this.dark,
      "--user_ultradark": this.ultradark
    }
  }
}

export class RoomColor {
  constructor(roomId) {
    this.hue = generateColor(roomId)
    this.ultralight = `hsl(${this.hue},100%, 95%)`
    this.light = `hsl(${this.hue},100%, 80%)`
    this.solid = `hsl(${this.hue},100%, 50%)`
    this.dark = `hsl(${this.hue},100%, 20%)`
    this.ultradark = `hsl(${this.hue},100%, 10%)`
    this.styleVariables = {
      "--room_ultralight": this.ultralight,
      "--room_light": this.light,
      "--room_solid": this.solid,
      "--room_dark": this.dark,
      "--room_ultradark": this.ultradark
    }
  }
}
