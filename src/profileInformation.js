import { h, createRef, Component } from 'preact';
import './styles/profileInformation.css'
import { onlineOrAlert } from "./utils/alerts.js"
import Client from './client.js'

export default class ProfileInfomation extends Component {
  constructor(props) {
    super(props)
    const me = Client.client.getUser(Client.client.getUserId())
    this.state = {
      previewUrl: Client.client.getHttpUriForMxcFromHS(me.avatarUrl, 180, 180, "crop"),
      displayName: me.displayName
    }
    if (localStorage.getItem("scrollbars") === "visible") this.scrollbarsVisible = true
  }

  displayNameInput = createRef()

  avatarImageInput = createRef()

  scrollbarVisibleSelect = createRef()

  submitButton = createRef()

  mainForm = createRef()

  progressHandler = (progress) => this.setState({progress})

  chooseAvatar = _ => this.avatarImageInput.current.click()

  removeAvatar = _ => this.setState({ previewUrl: null })

  handleKeydown = e => {
    e.stopPropagation() // don't go to global keypress handler
  }

  updatePreview = _ => {
    const theImage = this.avatarImageInput.current.files[0]
    if (theImage && /^image/.test(theImage.type)) {
      this.setState({previewUrl: URL.createObjectURL(this.avatarImageInput.current.files[0]) })
    }
  }

  updateProfile = async e => {
    e.preventDefault()
    if (!onlineOrAlert()) return
    const theImage = this.avatarImageInput.current.files[0]
    const theDisplayName = this.displayNameInput.current.value
    this.submitButton.current.setAttribute("disabled", true)
    localStorage.setItem("scrollbars", this.scrollbarVisibleSelect.current.value)
    document.documentElement.dataset.scrollbars = this.scrollbarVisibleSelect.current.value
    if (theDisplayName) await Client.client.setDisplayName(theDisplayName)
    if (theImage && /^image/.test(theImage.type)) {
      await Client.client.uploadContent(theImage, { progressHandler: this.progressHandler })
        .then(e => Client.client.setAvatarUrl(e))
    } else if (!this.state.previewUrl) {
      await Client.client.setAvatarUrl("null")
      // XXX this is a pretty awful hack. Discussion at https://github.com/matrix-org/matrix-doc/issues/1674
    }
    this.mainForm.current.reset()
    this.props.showMainView()
  }

  render (props, state) {
    // We include some key attributes here, because the removal and
    // insertion of divs causes click events to get handled by the wrong
    // elements as they bubble up through the DOM otherwise
    return <div id="profile-information">
      <h2>Оновити особисті дані</h2>
      <hr class="styled-rule" />
      <form id="profileInformationForm" ref={this.mainForm} onsubmit={this.updateProfile}>
        <label>Ідентифікатор кор-ча</label>
        <div id="profile-information-userid">
          {Client.client.getUserId()}
        </div>
        <label>Повне ім'я</label>
        <input class="styled-input" onkeydown={this.handleKeydown} placeholder={state.displayName} ref={this.displayNameInput} type="text" />
        <label class="top-aligned-label">Фото</label>
        {state.previewUrl
          ? <img onclick={this.chooseAvatar} id="profileSelector" src={state.previewUrl} />
          : <div key="profileSelector" onclick={this.chooseAvatar} id="profileSelector" />}
        <input id="profileInformationFormHidden" onchange={this.updatePreview} ref={this.avatarImageInput} accept="image/*" type="file" />
        <details>
          <summary>Видимість</summary>
          <div id="profile-display-options">
            <label for="scrollbar-visibility">в системі</label>
            <select class="styled-input" ref={this.scrollbarVisibleSelect} name="scrollbar-visibility">
              <option value="hidden">Не видимий</option>
              <option selected={this.scrollbarsVisible} value="visible">Видимий</option>
            </select>
          </div>
        </details>
        <details>
          <summary>Додаткові налаштування</summary>
          <div id="profile-advanced-options">
            <label>Системний токен</label>
            <pre>{Client.client.getAccessToken()}</pre>
          </div>
        </details>
        <div key="profileInformationFormSubmit" id="profileInformationFormSubmit">
          <button class="styled-button" ref={this.submitButton} type="submit">Оновити дані</button>
          {state.previewUrl ? <button class="styled-button" type="button" onclick={this.removeAvatar}>Видалити фото</button> : null}
          <button class="styled-button" type="button" onclick={props.logoutHandler}>Вийти</button>
        </div>
        {this.state.progress
          ? <div id="profileInformationFormProgress">
            <progress class="styled-progress" max={state.progress.total} value={state.progress.loaded} />
          </div>
          : null
        }
      </form>
    </div>
  }
}
