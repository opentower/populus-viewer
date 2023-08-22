import { h, createRef, Component } from 'preact';
import Client from './client.js'
import * as Matrix from "matrix-js-sdk"
import './styles/avatarSelector.css'
import { loadImageElement, blurhashFromFile } from "./utils/media.js"

export default class AvatarSelector extends Component {

  constructor(props) {
    super()
    this.state = {
      previewUrl: props.previewUrl || undefined
    }
  }

  avatarImageInput = createRef()

  chooseAvatar = _ => this.avatarImageInput.current.click()

  removeAvatar = _ => {
    this.setState({ previewUrl: null })
    delete this.avatarImage
    this.props.handleUpdate?.()
  }

  updatePreview = _ => {
    this.avatarImage = this.avatarImageInput.current.files[0]
    if (this.avatarImage && /^image/.test(this.avatarImage.type)) {
      this.setState({previewUrl: URL.createObjectURL(this.avatarImage) })
    }
    this.props.handleUpdate?.()
  }

  async uploadAvatar(room) {
    room = room || this.props.room
    if (this.avatarImage && /^image/.test(this.avatarImage.type)) {
      const {width, height} = await loadImageElement(this.avatarImage)
      this.setState({progress: "generating blurhash..."})
      const blurhash = await blurhashFromFile(this.avatarImage)
      await Client.client.uploadContent(this.avatarImage, { progressHandler: this.props.progressHandler })
        .then(e => Client.client
          .sendStateEvent(room.roomId, Matrix.EventType.RoomAvatar, {
            info: {
              w: width,
              h: height,
              mimetype: this.avatarImage.type ? this.avatarImage.type : "application/octet-stream",
              size: this.avatarImage.size,
              blurhash
            },
            url: e
          }, "")
        )
    } else if (this.state.previewUrl === null && this.props.room) { // null indicates deleted here
      await Client.client.sendStateEvent(this.props.room.roomId, Matrix.EventType.RoomAvatar, {}, "")
    }
  }

  render(props, state) {
    return <div id="select-avatar-wrapper">
        {state.previewUrl
          ? <img onclick={this.chooseAvatar} id="select-avatar-selector" src={state.previewUrl} />
          : <div key="select-avatar-selector" onclick={this.chooseAvatar} id="select-avatar-selector" />}
        {state.previewUrl ? <button id="select-avatar-change-avatar" type="button" onclick={this.removeAvatar}>Видалити Ваше фото</button> : null}
        {!state.previewUrl ? <button id="select-avatar-change-avatar" type="button" onclick={this.chooseAvatar}>Додати фото</button> : null}
        <input id="select-avatar-selector-hidden" onchange={this.updatePreview} ref={this.avatarImageInput} accept="image/*" type="file" />
      </div>
  }
}
